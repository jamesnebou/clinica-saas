import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260908100000_agenda_atomic_finance_canonical.sql", import.meta.url);

test("Fase 0B centraliza booking e pagamento de agenda em RPCs transacionais", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /agenda_criar_agendamento_atomico_v2/i);
  assert.match(sql, /agenda_booking_operations[\s\S]*unique \(clinica_id, idempotency_key\)/i);
  assert.match(sql, /procedimento_ids uuid\[\]/i);
  assert.match(sql, /finance_registrar_pagamento_agendamento_v2/i);
  assert.match(sql, /finance_liquidar_recebivel[\s\S]*gateway:/i);
  assert.match(sql, /finance_cancelar_pagamento_agendamento_v2/i);
  assert.match(sql, /finance_reconciliacao_legado_v2/i);
});

test("booking público e interno usam a mesma entrada de domínio", async () => {
  const [publicAction, dashboardAction] = await Promise.all([
    readFile(new URL("../src/app/c/[slug]/actions.js", import.meta.url), "utf8"),
    readFile(new URL("../src/app/dashboard/actions.js", import.meta.url), "utf8"),
  ]);
  assert.match(publicAction, /rpc\("agenda_criar_agendamento_atomico_v2"/);
  assert.match(dashboardAction, /rpc\("agenda_criar_agendamento_atomico_v2"/);
});

test("gateways liquidam o canônico antes de atualizar metadados do booking", async () => {
  const [asaas, infinitePay] = await Promise.all([
    readFile(new URL("../src/app/api/webhooks/asaas/route.js", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/webhooks/infinitepay/route.js", import.meta.url), "utf8"),
  ]);
  const asaasBooking = asaas.slice(asaas.indexOf("async function updatePublicBookingPayment"), asaas.indexOf("async function updateStoreOrderPayment"));
  const infiniteBooking = infinitePay.slice(infinitePay.indexOf("async function updateBooking"), infinitePay.indexOf("async function updateStoreOrder"));
  assert.ok(asaasBooking.indexOf("syncCanonicalAppointmentPayment") < asaasBooking.indexOf('.from("site_agendamentos_publicos")\n    .update'));
  assert.ok(infiniteBooking.indexOf("syncCanonicalAppointmentPayment") < infiniteBooking.indexOf('.from("site_agendamentos_publicos")\n    .update'));
  assert.doesNotMatch(asaasBooking, /from\("agendamentos"\)[\s\S]*?\.update/);
  assert.doesNotMatch(infiniteBooking, /from\("agendamentos"\)[\s\S]*?\.update/);
});

