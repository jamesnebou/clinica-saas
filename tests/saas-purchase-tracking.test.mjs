import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildSaasPurchaseDecision, normalizeAsaasPaymentStatus } from "../src/lib/saas/payment-tracking.mjs";

const webhook = await readFile(new URL("../src/app/api/webhooks/asaas/route.js", import.meta.url), "utf8");
const trackingService = await readFile(new URL("../src/lib/tracking/service.js", import.meta.url), "utf8");
const trackingMigration = await readFile(new URL("../supabase/migrations/20260831120000_tracking_2_meta_capi.sql", import.meta.url), "utf8");
const billingMigration = await readFile(new URL("../supabase/migrations/20260618174500_saas_comercial.sql", import.meta.url), "utf8");

const clinic = {
  id: "clinic_1",
  slug: "clinica-real",
  email: "financeiro@example.com",
  metadata: {},
  asaas_customer_id: "cus_1",
  asaas_subscription_id: "sub_current",
};
const payment = {
  id: "pay_1",
  customer: "cus_1",
  subscription: "sub_current",
  externalReference: "clinic_1",
  status: "CONFIRMED",
  value: 299.9,
};

test("PAYMENT_CONFIRMED SaaS gera um Purchase", () => {
  const result = buildSaasPurchaseDecision({ event: "PAYMENT_CONFIRMED", payment, clinic });
  assert.equal(result.shouldTrack, true);
  assert.equal(result.eventId, "purchase:pay_1");
});

test("PAYMENT_RECEIVED do mesmo payment continua com uma identidade Purchase", () => {
  const confirmed = buildSaasPurchaseDecision({ event: "PAYMENT_CONFIRMED", payment, clinic });
  const received = buildSaasPurchaseDecision({ event: "PAYMENT_RECEIVED", payment: { ...payment, status: "RECEIVED" }, clinic });
  assert.equal(new Set([confirmed.eventId, received.eventId]).size, 1);
});

test("webhook repetido continua com uma identidade e uma linha única", () => {
  const first = buildSaasPurchaseDecision({ event: "PAYMENT_CONFIRMED", payment, clinic });
  const repeated = buildSaasPurchaseDecision({ event: "PAYMENT_CONFIRMED", payment, clinic });
  assert.equal(first.eventId, repeated.eventId);
  assert.match(trackingMigration, /unique\(event_name, event_id\)/i);
  assert.match(webhook, /if \(result\?\.created === false\) return/);
});

test("pagamento de paciente não gera Purchase NexaWi", () => {
  const result = buildSaasPurchaseDecision({ event: "PAYMENT_RECEIVED", payment: { ...payment, subscription: null, externalReference: "booking_1" }, clinic });
  assert.equal(result.shouldTrack, false);
});

test("pagamento de loja não gera Purchase NexaWi", () => {
  const result = buildSaasPurchaseDecision({ event: "PAYMENT_RECEIVED", payment: { ...payment, subscription: null, externalReference: "loja:order_1" }, clinic });
  assert.equal(result.shouldTrack, false);
  assert.ok(webhook.indexOf("storeOrderUpdated) return") < webhook.indexOf("const purchase = buildSaasPurchaseDecision"));
});

test("payment sem subscription não gera Purchase", () => {
  assert.equal(buildSaasPurchaseDecision({ event: "PAYMENT_CONFIRMED", payment: { ...payment, subscription: null }, clinic }).reason, "subscription_required");
});

test("subscription antiga não gera Purchase", () => {
  assert.equal(buildSaasPurchaseDecision({ event: "PAYMENT_CONFIRMED", payment: { ...payment, subscription: "sub_old" }, clinic }).reason, "stale_subscription");
});

test("Demo não gera Purchase", () => {
  const demo = { ...clinic, slug: "demo-nexawi-clinicas", metadata: { demo: true } };
  assert.equal(buildSaasPurchaseDecision({ event: "PAYMENT_CONFIRMED", payment, clinic: demo }).reason, "demo_clinic");
  assert.match(trackingService, /isDemoSaasClinic\(clinic\)/);
});

test("Meta indisponível não interrompe o processamento financeiro", () => {
  const billingUpsert = webhook.indexOf('.from("asaas_cobrancas").upsert');
  const trackingTry = webhook.indexOf("try {", webhook.indexOf("Purchase Meta"));
  const finalSuccess = webhook.lastIndexOf("NextResponse.json({ ok: true");
  assert.ok(billingUpsert >= 0 && trackingTry > billingUpsert && finalSuccess > trackingTry);
  assert.match(webhook, /catch \(trackingError\)[\s\S]*marketing_purchase_tracking_failed/);
});

test("Purchase usa value pago e moeda BRL", () => {
  const result = buildSaasPurchaseDecision({ event: "PAYMENT_CONFIRMED", payment, clinic });
  assert.equal(result.value, 299.9);
  assert.equal(result.currency, "BRL");
  assert.equal(result.sourceType, "saas_payment");
});

test("event_id é estável e deriva apenas do payment.id", () => {
  const changedEvent = buildSaasPurchaseDecision({ event: "PAYMENT_RECEIVED", payment: { ...payment, status: "RECEIVED", value: 399 }, clinic });
  assert.equal(changedEvent.eventId, "purchase:pay_1");
});

test("refund atualiza financeiro sem criar Purchase novo", () => {
  assert.equal(normalizeAsaasPaymentStatus({ event: "PAYMENT_REFUNDED", status: "REFUNDED" }), "estornado");
  assert.equal(buildSaasPurchaseDecision({ event: "PAYMENT_REFUNDED", payment: { ...payment, status: "REFUNDED" }, clinic }).shouldTrack, false);
  assert.match(webhook, /preserveHistoricalPaidAt/);
});

test("chargeback atualiza financeiro sem criar Purchase novo", () => {
  assert.equal(normalizeAsaasPaymentStatus({ event: "PAYMENT_CHARGEBACK_REQUESTED", status: "CHARGEBACK_REQUESTED" }), "contestado");
  assert.equal(buildSaasPurchaseDecision({ event: "PAYMENT_CHARGEBACK_REQUESTED", payment: { ...payment, status: "CHARGEBACK_REQUESTED" }, clinic }).shouldTrack, false);
});

test("PAYMENT_UPDATED com status pago não cria Purchase", () => {
  assert.equal(buildSaasPurchaseDecision({ event: "PAYMENT_UPDATED", payment, clinic }).shouldTrack, false);
  assert.equal(normalizeAsaasPaymentStatus({ event: "PAYMENT_UPDATED", status: "CONFIRMED" }), "pendente");
});

test("booking retorna antes da decisão Purchase", () => {
  assert.ok(webhook.indexOf("publicBookingUpdated) {") < webhook.indexOf("const purchase = buildSaasPurchaseDecision"));
});

test("asaas_cobrancas permanece idempotente por payment.id", () => {
  assert.match(billingMigration, /asaas_payment_id text unique/i);
  assert.match(webhook, /onConflict: "asaas_payment_id"/);
});

test("atribuição de campanha e first/last touch permanece no Tracking 2", () => {
  for (const field of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "fbc", "fbp", "first_touch", "last_touch"]) {
    assert.match(trackingService, new RegExp(field));
  }
});
