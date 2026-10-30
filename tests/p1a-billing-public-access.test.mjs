import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publicClinicAccess } from "../src/lib/saas/public-access.mjs";
import { saasPaymentActivation } from "../src/lib/saas/payment-tracking.mjs";

const now = new Date("2026-10-27T12:00:00Z");
const trial = { status: "trial", assinatura_status: "pendente", trial_ends_at: "2026-10-28T12:00:00Z" };
const subscriptionId = "sub_current";
const clinic = {
  id: "clinic_1", status: "pendente", plano: "starter", assinatura_status: "pendente",
  asaas_subscription_id: subscriptionId, asaas_customer_id: "cus_1",
  metadata: { assinatura_solicitada_plano: "growth", assinatura_solicitada_subscription_id: subscriptionId, assinatura_solicitada_valor: 197 },
};
const payment = { id: "pay_1", subscription: subscriptionId, customer: "cus_1", status: "CONFIRMED", value: 197 };

test("trial só aceita operação pública antes do vencimento", () => {
  assert.deepEqual(publicClinicAccess(trial, now), { allowed: true, reason: "trial" });
  assert.deepEqual(publicClinicAccess({ ...trial, trial_ends_at: now.toISOString() }, now), { allowed: false, reason: "trial_expired" });
  assert.equal(publicClinicAccess({ ...trial, trial_ends_at: null }, now).allowed, false);
});

test("pagante, pendente, cancelado e modos especiais", () => {
  assert.equal(publicClinicAccess({ status: "ativa", assinatura_status: "ativa" }, now).allowed, true);
  assert.equal(publicClinicAccess({ status: "pendente", assinatura_status: "pendente" }, now).allowed, false);
  assert.equal(publicClinicAccess({ status: "cancelada", assinatura_status: "cancelada" }, now).allowed, false);
  assert.equal(publicClinicAccess({ ...trial, assinatura_status: "cancelada" }, now).allowed, false);
  for (const mode of ["unlimited_lifetime", "internal_full_access"]) {
    assert.equal(publicClinicAccess({ status: "ativa", plan_entitlements_mode: mode, plan_entitlements_version: 1 }, now).allowed, true);
    assert.equal(publicClinicAccess({ status: "inadimplente", plan_entitlements_mode: mode, plan_entitlements_version: 1 }, now).allowed, true);
  }
});

test("somente evento financeiro confirmado da assinatura atual ativa", () => {
  assert.deepEqual(saasPaymentActivation({ clinic, payment, event: "PAYMENT_CONFIRMED" }), { activate: true, plan: "growth", reason: "target_plan_paid" });
  assert.deepEqual(saasPaymentActivation({ clinic, payment, event: "SUBSCRIPTION_PAYMENT_SYNC" }), { activate: true, plan: "growth", reason: "target_plan_paid" });
  assert.equal(saasPaymentActivation({ clinic, payment: { ...payment, status: "PENDING" }, event: "SUBSCRIPTION_PAYMENT_SYNC" }).activate, false);
  assert.equal(saasPaymentActivation({ clinic, payment, event: "PAYMENT_CREATED" }).activate, false);
  assert.equal(saasPaymentActivation({ clinic, payment: { ...payment, subscription: "sub_other" }, event: "PAYMENT_CONFIRMED" }).activate, false);
  assert.equal(saasPaymentActivation({ clinic, payment: { ...payment, value: 97 }, event: "PAYMENT_CONFIRMED" }).activate, false);
  assert.equal(saasPaymentActivation({ clinic: { ...clinic, assinatura_status: "cancelada" }, payment, event: "PAYMENT_CONFIRMED" }).activate, false);
});

test("sincronização só conclui corrida financeira na assinatura recém-criada", () => {
  const source = readFileSync(new URL("../src/app/dashboard/assinatura/actions.js", import.meta.url), "utf8");
  assert.match(source, /if \(createdSubscription && !keepPaidAccess\)/);
  assert.match(source, /event: "SUBSCRIPTION_PAYMENT_SYNC"/);
  assert.match(source, /\.in\("status", \["trial", "pendente"\]\)/);
});

test("entradas públicas barram antes das escritas", () => {
  for (const file of [
    "src/app/c/[slug]/actions.js", "src/app/c/[slug]/store-actions.js", "src/app/api/public/availability/route.js",
  ]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /canAcceptPublicOperation\(clinic\)/);
    assert.match(source, /trial_ends_at, plan_entitlements_mode, plan_entitlements_version/);
  }
  const booking = readFileSync(new URL("../src/app/c/[slug]/actions.js", import.meta.url), "utf8");
  assert.ok(booking.indexOf("canAcceptPublicOperation(clinic)") < booking.indexOf(".from(\"procedimentos\")"));
});
