import test from "node:test";
import assert from "node:assert/strict";
import { appointmentRates, buildDeterministicInsights, compareMetric, crmConversion, retentionRate, revenueRanking } from "../src/lib/domain/bi-core.mjs";
import { resolveCapabilities, resolvePrimarySegment } from "../src/lib/domain/segment-core.mjs";
import { dateKeyForTimeZone, resolvePeriodDateKeys } from "../src/lib/domain/bi-period-core.mjs";
import { buildBIRpcParams, normalizeBIFilters } from "../src/lib/domain/bi-query-core.mjs";

test("compara indicadores sem fabricar percentual quando não existe base anterior", () => {
  assert.deepEqual(compareMetric(0, 0), { current: 0, previous: 0, absolute: 0, percentage: 0 });
  assert.equal(compareMetric(100, 0).percentage, null);
  assert.equal(compareMetric(120, 100).percentage, 20);
});

test("insights determinísticos só aparecem acima do limite definido", () => {
  const insights = buildDeterministicInsights({ recebido: 700, taxa_no_show: 20, taxa_cancelamento: 2, taxa_conversao: 30 }, { recebido: 1000, taxa_no_show: 10, taxa_cancelamento: 2, taxa_conversao: 32 });
  assert.deepEqual(insights.map((item) => item.type).sort(), ["recebido", "taxa_no_show"]);
  assert.ok(insights.every((item) => item.suggestedAction));
});

test("recorrência considera retorno do mesmo paciente dentro da janela", () => {
  const result = retentionRate([
    { cliente_id: "a", inicio: "2026-08-01T10:00:00Z" },
    { cliente_id: "a", inicio: "2026-08-20T10:00:00Z" },
    { cliente_id: "b", inicio: "2026-08-01T10:00:00Z" },
    { cliente_id: "b", inicio: "2026-10-01T10:00:00Z" },
  ], 30);
  assert.deepEqual(result, { eligible: 2, retained: 1, rate: 50 });
});

test("capabilities combinam segmento, plano e override da clínica", () => {
  const effective = resolveCapabilities({
    segmentCapabilities: ["agenda", "bi", "prontuario"],
    planCapabilities: ["agenda", "bi"],
    overrides: [{ capability: "bi", habilitada: false }, { capability: "automacoes", habilitada: true }],
  });
  assert.deepEqual(effective, ["agenda", "automacoes"]);
  assert.equal(resolvePrimarySegment([{ principal: false, segmentos: { slug: "odontologia" } }, { principal: true, segmentos: { slug: "medicina" } }]), "medicina");
});

test("no-show, cancelamento e conclusão usam o mesmo denominador", () => {
  const result = appointmentRates([{ status: "concluido" }, { status: "concluido" }, { status: "faltou" }, { status: "cancelado" }]);
  assert.equal(result.conclusionRate, 50);
  assert.equal(result.noShowRate, 25);
  assert.equal(result.cancellationRate, 25);
});

test("conversão CRM considera leads do conjunto filtrado", () => {
  assert.deepEqual(crmConversion([{ status: "lead" }, { status: "convertido" }, { status: "perdido" }, { status: "convertido" }]), { leads: 4, converted: 2, rate: 50 });
});

test("ranking por profissional e procedimento exclui faltas e cancelamentos", () => {
  const records = [
    { profissional_id: "p1", procedimento_id: "a", status: "concluido", pagamento_status: "pago", valor: 200, valor_pago: 200 },
    { profissional_id: "p1", procedimento_id: "b", status: "faltou", pagamento_status: "pendente", valor: 500, valor_pago: 0 },
    { profissional_id: "p2", procedimento_id: "a", status: "confirmado", pagamento_status: "parcial", valor: 300, valor_pago: 100 },
  ];
  assert.deepEqual(revenueRanking(records, "profissional_id"), [
    { id: "p1", quantity: 1, expected: 200, received: 200 },
    { id: "p2", quantity: 1, expected: 300, received: 100 },
  ]);
  assert.deepEqual(revenueRanking(records, "procedimento_id"), [{ id: "a", quantity: 2, expected: 500, received: 300 }]);
});

test("períodos respeitam fuso e comparam intervalo anterior equivalente", () => {
  const instant = new Date("2026-08-26T01:30:00Z");
  assert.equal(dateKeyForTimeZone(instant, "America/Bahia"), "2026-08-25");
  assert.equal(dateKeyForTimeZone(instant, "Europe/Lisbon"), "2026-08-26");
  assert.deepEqual(resolvePeriodDateKeys({ preset: "7d", today: "2026-08-25" }), {
    startKey: "2026-08-19", endExclusiveKey: "2026-08-26", previousStartKey: "2026-08-12", label: "Últimos 7 dias", durationDays: 7,
  });
});

test("filtros são normalizados e a RPC permanece presa ao tenant autenticado", () => {
  const filters = normalizeBIFilters({ profissional: " p1 ", origem: "Instagram", canal: " paid_social ", status: "" });
  assert.equal(filters.profissional, "p1");
  assert.equal(filters.status, null);
  const params = buildBIRpcParams({
    clinicId: "clinic-a",
    period: { current: { start: new Date("2026-08-01T03:00:00Z"), end: new Date("2026-09-01T03:00:00Z") }, previous: { start: new Date("2026-07-01T03:00:00Z"), end: new Date("2026-08-01T03:00:00Z") }, timeZone: "America/Bahia" },
    filters,
  });
  assert.equal(params.p_clinica_id, "clinic-a");
  assert.equal(params.p_profissional_id, "p1");
  assert.equal(params.p_canal, "paid_social");
  assert.throws(() => buildBIRpcParams({ clinicId: "", period: {}, filters: {} }), /Clínica obrigatória/);
});
