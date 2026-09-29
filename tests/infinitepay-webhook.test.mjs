import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { memoryDatabase } from "./helpers/whatsapp-db.mjs";

const appointmentId = "11111111-1111-4111-8111-111111111111";
const clinicId = "22222222-2222-4222-8222-222222222222";
let state;
globalThis.__infinitepayWebhookTest = () => state;
const modules = {
  "next/server": "export const NextResponse = { json: (body, options) => Response.json(body, options) };",
  "@/lib/security/public-antiabuse": "export async function consumePublicRateLimit() { return { allowed: true }; } export function publicRateLimitResponse() { return new Response(null, { status: 429 }); }",
  "@/lib/supabase/admin": "export const supabaseAdmin = { from: (...args) => globalThis.__infinitepayWebhookTest().db.from(...args) };",
  "@/lib/infinitepay/client": "export async function checkInfinitePayPayment(args) { const s=globalThis.__infinitepayWebhookTest(); s.checks.push(args); if(s.verificationError) throw s.verificationError; return s.verification; }",
  "@/lib/finance/canonical": "export async function syncCanonicalAppointmentPayment(args) { const s=globalThis.__infinitepayWebhookTest(); s.finance.push(args); if(s.financeError) throw s.financeError; } export async function syncCanonicalOrderPayment(args) { globalThis.__infinitepayWebhookTest().orders.push(args); }",
  "@/lib/notifications/booking": "export async function notifyPublicBookingPaymentConfirmedById(id) { globalThis.__infinitepayWebhookTest().notifications.push(id); }",
  "@/lib/whatsapp/events": "export async function emitDomainEvent(event) { globalThis.__infinitepayWebhookTest().events.push(event); }",
  "@/lib/crm/payments": "export async function closeDirectSaleOpportunityFromBooking() {}",
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (Object.hasOwn(modules, specifier)) return { url: "data:text/javascript," + encodeURIComponent(modules[specifier]), shortCircuit: true };
    if (specifier === "@/lib/security/public-antiabuse-core.mjs") return { url: new URL("../src/lib/security/public-antiabuse-core.mjs", import.meta.url).href, shortCircuit: true };
    return next(specifier, context);
  },
});
const { POST } = await import("../src/app/api/webhooks/infinitepay/route.js");
hooks.deregister();

function setup(captureMethod = "pix") {
  state = {
    db: memoryDatabase({
      clinica_integracoes: [{ clinica_id: clinicId, infinitepay_handle: "test-clinic" }],
      site_agendamentos_publicos: [{ id: "booking", clinica_id: clinicId, agendamento_id: appointmentId, valor_total: 70, valor_sinal: 35, pagamento_status: "pendente", payload: {} }],
      pedidos_clinica: [{ id: appointmentId, clinica_id: clinicId, total: 70, pagamento_status: "pendente", payload_pagamento: {} }],
    }),
    verification: { success: true, paid: true, amount: 3500, capture_method: captureMethod },
    checks: [], finance: [], orders: [], notifications: [], events: [], logs: [],
  };
  return state;
}
const webhook = (extra = {}) => ({
  order_nsu: `agendamento:${appointmentId}`, transaction_nsu: "test-transaction",
  invoice_slug: "test-invoice", amount: 3500, ...extra,
});
async function post(payload = webhook()) {
  const original = console.error;
  console.error = (...args) => state.logs.push(args);
  try {
    return await POST(new Request("https://example.com/api/webhooks/infinitepay", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }));
  } finally { console.error = original; }
}

for (const [captureMethod, expected] of [["pix", "pix"], ["credit_card", "cartao"], ["debit_card", "cartao"], [undefined, "outro"], ["unknown", "outro"]]) {
  test(`booking webhook stores ${expected}, not the provider, for ${captureMethod}`, async () => {
    const s = setup();
    s.verification.capture_method = captureMethod;
    const result = await post();
    assert.equal(result.status, 200);
    assert.equal(s.finance.length, 1);
    assert.equal(s.finance[0].paymentMethod, expected);
    assert.equal(s.finance[0].provider, "infinitepay");
    assert.equal(s.finance[0].paidValue, 35);
    assert.equal(s.finance[0].value, 70);
    assert.equal(s.finance[0].providerReference, "test-transaction");
    assert.equal(s.db.tables.site_agendamentos_publicos[0].pagamento_status, "pago");
    assert.equal(s.events[0].eventName, "payment.confirmed");
    assert.equal(s.notifications.length, 1);
    const schema = await readFile(new URL("../supabase/migrations/20260618162000_storage_financeiro_basico.sql", import.meta.url), "utf8");
    const allowed = schema.match(/forma_pagamento text check \(forma_pagamento in \(([^)]+)\)\)/)[1];
    assert.ok(allowed.split(",").map(v => v.trim().replaceAll("'", "")).includes(expected));
  });
}

test("provider verification, not webhook capture_method, determines the booking payment method", async () => {
  const s = setup("pix");
  assert.equal((await post(webhook({ capture_method: "credit_card" }))).status, 200);
  assert.equal(s.finance[0].paymentMethod, "pix");
});

test("verified duplicate delivery does not book the deposit or emit notifications twice", async () => {
  const s = setup();
  assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 200);
  assert.equal(s.checks.length, 2);
  assert.equal(s.finance.length, 1);
  assert.equal(s.events.length, 1);
  assert.equal(s.notifications.length, 1);
});

test("finance failure preserves pending status and returns a retryable error without customer data", async () => {
  const s = setup();
  s.financeError = { code: "23514", message: "private customer data", details: "private row" };
  const result = await post();
  assert.equal(result.status, 400);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(s.db.tables.site_agendamentos_publicos[0].pagamento_status, "pendente");
  assert.equal(s.events.length, 0);
  assert.equal(s.notifications.length, 0);
  assert.deepEqual(s.logs, [["infinitepay_webhook_failed", { stage: "booking_finance", resourceType: "agendamento", resourceId: appointmentId, code: "23514" }]]);
  assert.doesNotMatch(JSON.stringify(await result.json()), /private|23514/);
  s.financeError = null;
  assert.equal((await post()).status, 200);
  assert.equal(s.db.tables.site_agendamentos_publicos[0].pagamento_status, "pago");
});

test("wrong amount and rejected verification never reach the finance writer", async () => {
  for (const verification of [{ success: true, paid: true, amount: 3400 }, { success: false, paid: true, amount: 3500 }]) {
    const s = setup();
    s.verification = verification;
    assert.equal((await post()).status, 400);
    assert.equal(s.finance.length, 0);
    assert.equal(s.db.tables.site_agendamentos_publicos[0].pagamento_status, "pendente");
    assert.equal(s.logs[0][1].stage, "payment_verification");
  }
});

test("unpaid payment stays pending", async () => {
  const s = setup();
  s.verification.paid = false;
  assert.equal((await post()).status, 200);
  assert.equal(s.finance.length, 0);
  assert.equal(s.notifications.length, 0);
});

test("missing booking returns an error so the provider can retry", async () => {
  const s = setup();
  s.db.tables.site_agendamentos_publicos = [];
  assert.equal((await post()).status, 400);
  assert.equal(s.logs[0][1].code, "BOOKING_NOT_FOUND");
  assert.equal(s.finance.length, 0);
});

test("store card payment keeps the existing store-specific payment method", async () => {
  const s = setup("credit_card");
  s.verification.amount = 7000;
  assert.equal((await post(webhook({ order_nsu: `loja:${appointmentId}`, amount: 7000 }))).status, 200);
  assert.equal(s.orders[0].paymentMethod, "cartao_credito");
  assert.equal(s.finance.length, 0);
});
