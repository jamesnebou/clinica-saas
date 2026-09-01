import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildSubscriptionUpdatePayload,
  decideSubscriptionMutation,
  filterOperationalCharges,
  selectReusableAsaasSubscription,
} from "../src/lib/saas/subscription-lifecycle.mjs";

const actions = await readFile(new URL("../src/app/dashboard/assinatura/actions.js", import.meta.url), "utf8");
const client = await readFile(new URL("../src/lib/asaas/client.js", import.meta.url), "utf8");
const webhook = await readFile(new URL("../src/app/api/webhooks/asaas/route.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831140000_saas_subscription_lifecycle.sql", import.meta.url), "utf8");

const active = { id: "sub_active", status: "ACTIVE", billingType: "PIX", externalReference: "clinic" };
const inactive = { id: "sub_inactive", status: "INACTIVE", billingType: "PIX", externalReference: "clinic" };

test("primeira ativação cria uma subscription", () => {
  assert.equal(decideSubscriptionMutation({ subscription: null, targetPlanSlug: "starter" }).type, "create");
});

test("segunda ativação idêntica não cria outra", () => {
  const decision = decideSubscriptionMutation({ subscription: active, currentPlanSlug: "starter", targetPlanSlug: "starter", billingType: "PIX" });
  assert.deepEqual(decision, { type: "synchronize", createsSubscription: false, tracksSubscribe: false });
});

test("pausa usa a mesma subscription", () => {
  assert.match(client, /pauseAsaasSubscription[\s\S]*status:\s*"INACTIVE"/);
  assert.match(actions, /pauseAsaasSubscription\(subscription\.id\)/);
});

test("reativação usa a mesma subscription", () => {
  assert.equal(decideSubscriptionMutation({ subscription: inactive, currentPlanSlug: "starter", targetPlanSlug: "starter" }).type, "reactivate");
  assert.match(client, /reactivateAsaasSubscription[\s\S]*status:\s*"ACTIVE"[\s\S]*nextDueDate/);
});

test("pause e reactivate preservam subscription.id", () => {
  const selected = selectReusableAsaasSubscription({ localSubscriptionId: inactive.id, subscriptions: [inactive] });
  assert.equal(selected.subscription.id, inactive.id);
  assert.match(actions, /asaas_subscription_id:\s*subscription\.id/);
});

test("reativação não gera novo Subscribe", () => {
  const decision = decideSubscriptionMutation({ subscription: inactive, currentPlanSlug: "starter", targetPlanSlug: "starter" });
  assert.equal(decision.tracksSubscribe, false);
  assert.match(actions, /if \(createdSubscription\) \{[\s\S]*eventName:\s*"Subscribe"/);
});

test("troca de plano atualiza assinatura em vez de criar paralela", () => {
  const decision = decideSubscriptionMutation({ subscription: active, currentPlanSlug: "starter", targetPlanSlug: "growth", billingType: "PIX" });
  assert.equal(decision.type, "update");
  assert.match(actions, /updateAsaasSubscription\([\s\S]*subscription\.id/);
});

test("Subscribe ocorre apenas na criação original", () => {
  assert.match(actions, /createdSubscription\s*=\s*true/);
  assert.match(actions, /if \(createdSubscription\) \{[\s\S]*deterministicMetaEventId\("subscribe", subscription\.id\)/);
});

test("duplo envio usa uma operation_key única", () => {
  assert.match(migration, /operation_key uuid not null unique/);
  assert.match(actions, /p_operation_key:\s*operationKey\(formData\)/);
});

test("concorrência permite apenas uma operação processing por clínica", () => {
  assert.match(migration, /unique index[\s\S]*\(clinica_id\)[\s\S]*where status = 'processing'/i);
  assert.match(migration, /on conflict do nothing[\s\S]*returning id into v_operation_id/i);
});

test("falha Asaas não deixa estado local como ativo", () => {
  const apiMutation = actions.indexOf("subscription = await createAsaasSubscriptionForClinic");
  const localActivation = actions.indexOf('assinatura_status: "ativa"');
  assert.ok(apiMutation >= 0 && localActivation > apiMutation);
  assert.match(actions, /status:\s*"failed"[\s\S]*SUBSCRIPTION_OPERATION_FAILED/);
});

test("cancelamento definitivo encerra a recorrência correta", () => {
  assert.match(client, /removeAsaasSubscription[\s\S]*method:\s*"DELETE"/);
  assert.match(actions, /removeAsaasSubscription\(subscription\.id\)/);
});

test("cobrança paga nunca é rebaixada por webhook atrasado", () => {
  assert.match(webhook, /preservePaidCharge/);
  assert.match(webhook, /effectivePaymentStatus/);
  const rows = filterOperationalCharges([
    { status: "pago", asaas_subscription_id: "old" },
    { status: "pendente", asaas_subscription_id: "old" },
    { status: "pendente", asaas_subscription_id: "current" },
  ], "current");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, "pago");
});

test("cobranças pendentes não são alteradas na troca de plano", () => {
  assert.equal(buildSubscriptionUpdatePayload({ plan: { nome: "Growth", preco_mensal: 197 }, billingType: "PIX" }).updatePendingPayments, false);
});

test("Purchase continua somente no webhook de pagamento SaaS atual confirmado", () => {
  assert.match(webhook, /buildSaasPurchaseDecision\(\{ event, payment, clinic: subscriptionClinic \}\)/);
  assert.match(webhook, /if \(purchase\.shouldTrack\)/);
});

test("booking e store continuam fora do Purchase da NexaWi", () => {
  const store = webhook.indexOf("updateStoreOrderPayment");
  const booking = webhook.indexOf("updatePublicBookingPayment");
  const purchase = webhook.indexOf('eventName: "Purchase"');
  assert.ok(store >= 0 && booking >= 0 && store < purchase && booking < purchase);
});

test("Demo não gera Subscribe nem Purchase", () => {
  assert.match(actions, /isDemoLoginEmail\(user\?\.email\)/);
  assert.match(actions, /isDemoClinic\(clinic\)/);
  assert.match(actions, /DEMO_SUBSCRIPTION_FORBIDDEN/);
});
