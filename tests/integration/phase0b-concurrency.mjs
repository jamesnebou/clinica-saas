import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const clinicId = crypto.randomUUID();
const professionalId = crypto.randomUUID();
const procedureId = crypto.randomUUID();

async function must(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data;
}

try {
  await must(db.from("clinicas").insert({ id: clinicId, nome: "F0B concorrência", slug: `f0b-${clinicId}`, status: "ativa" }));
  await must(db.from("profissionais").insert({ id: professionalId, clinica_id: clinicId, nome: "Profissional", ativo: true }));
  await must(db.from("procedimentos").insert({ id: procedureId, clinica_id: clinicId, nome: "Procedimento", preco: 100, ativo: true }));

  const booking = (keySuffix) => db.rpc("agenda_criar_agendamento_atomico_v2", {
    p_clinica_id: clinicId,
    p_cliente_id: null,
    p_profissional_id: professionalId,
    p_procedimento_ids: [procedureId],
    p_inicio: "2031-02-10T12:00:00.000Z",
    p_fim: "2031-02-10T13:00:00.000Z",
    p_valor: 100,
    p_observacoes: "concorrência real",
    p_idempotency_key: `concorrente-${keySuffix}`,
    p_public_booking: null,
  });
  const bookingResults = await Promise.all([booking("a"), booking("b")]);
  assert.equal(bookingResults.filter((item) => !item.error).length, 1, "somente uma reserva concorrente deve vencer");
  assert.equal(bookingResults.filter((item) => item.error?.code === "23P01").length, 1, "a perdedora deve receber conflito de sobreposição");

  const appointments = await must(db.from("agendamentos").select("id").eq("clinica_id", clinicId));
  assert.equal(appointments.length, 1);
  const appointmentId = appointments[0].id;
  const payment = () => db.rpc("finance_registrar_pagamento_agendamento_v2", {
    p_clinica_id: clinicId,
    p_agendamento_id: appointmentId,
    p_valor_total: 100,
    p_valor_pago: 100,
    p_descricao: "Pagamento concorrente",
    p_provider: "asaas",
    p_provider_reference: "pay-concorrente-f0b",
    p_pago_em: new Date().toISOString(),
    p_forma_pagamento: "pix",
    p_metadata: { test: true },
  });
  const paymentResults = await Promise.all([payment(), payment()]);
  assert.equal(paymentResults.filter((item) => !item.error).length, 2, "retries concorrentes devem responder sem erro");
  const liquidations = await must(db.from("finance_liquidacoes").select("id").eq("clinica_id", clinicId).eq("provider_reference", "pay-concorrente-f0b").eq("tipo", "recebimento"));
  assert.equal(liquidations.length, 1, "somente uma liquidação deve existir");
  const receivable = await must(db.from("finance_recebiveis").select("valor_total,valor_recebido,status").eq("clinica_id", clinicId).eq("agendamento_id", appointmentId).single());
  assert.deepEqual({ total: Number(receivable.valor_total), received: Number(receivable.valor_recebido), status: receivable.status }, { total: 100, received: 100, status: "pago" });
  console.log("phase0b_concurrency_ok", { bookingWinners: 1, bookingConflicts: 1, liquidations: 1 });
} finally {
  await db.from("clinicas").delete().eq("id", clinicId);
}
