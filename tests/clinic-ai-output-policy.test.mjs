import test from "node:test";
import assert from "node:assert/strict";
import { assertClinicSummaryOutputSafe } from "../src/lib/ai/summary-output-policy.mjs";
import { clinicSummarySchema, generateClinicSummary } from "../src/lib/ai/summary-generation.mjs";

const snapshot = {
  period: { days: 30 }, agenda: { total: 10, completed: 7, confirmed: 1, canceled: 1, noShows: 1, upcoming: 2 },
  finance: { realizedEntries: 125, realizedExits: 35 }, customers: { total: 20, newInPeriod: 3 }, procedures: [],
  trends: { appointmentsPercent: 25, receivedPercent: 50, noShowRatePercent: 10 },
};
const safe = () => ({ title: "Resumo de gestão", executiveSummary: "Foram 10 agendamentos. Taxa de faltas de 10%.",
  highlights: [{ title: "Financeiro", detail: "Receita realizada de R$ 125,00 e despesas realizadas de R$ 35,00." }],
  alerts: [{ severity: "low", title: "Faltas", detail: "Houve 1 falta e 1 cancelamento." }],
  opportunities: [{ title: "Agenda", detail: "Revise horários ociosos." }],
  recommendedActions: [{ priority: 1, action: "Revisar confirmações de agenda", rationale: "Acompanhar a taxa de faltas." }],
});

test("legitimate administrative, absence, no-show and financial text is accepted", () => {
  const output = safe();
  assert.equal(clinicSummarySchema.safeParse(output).success, true);
  assert.doesNotThrow(() => assertClinicSummaryOutputSafe(output, snapshot));
  assert.doesNotThrow(() => assertClinicSummaryOutputSafe({ ...output, executiveSummary: "Sem dados para comparar o período anterior." }, snapshot));
  assert.doesNotThrow(() => assertClinicSummaryOutputSafe({ ...output, alerts: [], highlights: [], opportunities: [], recommendedActions: [] }, snapshot));
});

test("policy rejects unsafe content in every textual field", () => {
  const mutations = [
    (o) => { o.title = "Paciente Maria tem diagnóstico de diabetes"; },
    (o) => { o.executiveSummary = "Prescreva medicamento para a paciente."; },
    (o) => { o.executiveSummary = "Contato: pessoa@example.invalid"; },
    (o) => { o.highlights[0].title = "CPF 000.111.222-33"; },
    (o) => { o.highlights[0].detail = "Telefone (11) 98765-4321"; },
    (o) => { o.alerts[0].title = "Paciente Ana apresenta lesão"; },
    (o) => { o.alerts[0].detail = "Cliente João necessita de terapia."; },
    (o) => { o.opportunities[0].title = "Prescrição individual"; },
    (o) => { o.opportunities[0].detail = "Receita realizada de R$ 999,00."; },
    (o) => { o.recommendedActions[0].action = "Aplique botox na paciente"; },
    (o) => { o.recommendedActions[0].rationale = "Houve 99 faltas no período."; },
    (o) => { o.recommendedActions[0].action = "Indique dipirona 500 mg."; },
    (o) => { o.highlights[0].detail = "Ela apresenta diabetes."; },
  ];
  for (const mutate of mutations) {
    const output = safe();
    mutate(output);
    assert.equal(clinicSummarySchema.safeParse(output).success, true);
    assert.throws(() => assertClinicSummaryOutputSafe(output, snapshot), { message: "AI_UNSAFE_OUTPUT" });
  }
});

test("contradictory counts and percentages are rejected, valid zero and decimal values pass", () => {
  for (const claim of ["Foram 99 agendamentos.", "Total de 9 cancelamentos.", "Taxa de faltas de 90%.",
    "Saídas realizadas de R$ 40,00.", "R$ 999,00 de receita realizada.", "Faltas: 99."]) {
    assert.throws(() => assertClinicSummaryOutputSafe({ ...safe(), executiveSummary: claim }, snapshot));
  }
  const empty = { ...snapshot, agenda: { total: 0, completed: 0, confirmed: 0, canceled: 0, noShows: 0, upcoming: 0 },
    finance: { realizedEntries: 0, realizedExits: 0 }, trends: { appointmentsPercent: null, receivedPercent: null, noShowRatePercent: null } };
  const zeroOutput = { ...safe(), executiveSummary: "Foram 0 agendamentos. Receita realizada de R$ 0,00.",
    highlights: [], alerts: [], opportunities: [], recommendedActions: [] };
  assert.doesNotThrow(() => assertClinicSummaryOutputSafe(zeroOutput, empty));
  assert.throws(() => assertClinicSummaryOutputSafe({ ...zeroOutput, executiveSummary: "Taxa de faltas de 0%." }, empty));
});

test("unsafe and malformed model responses never return or enter logs", async () => {
  const previousInfo = console.info;
  const previousWarn = console.warn;
  const logs = [];
  console.info = (...args) => logs.push(args);
  console.warn = (...args) => logs.push(args);
  try {
    for (const output of [
      { ...safe(), executiveSummary: "Prescreva medicamento para a paciente." },
      { ...safe(), alerts: [{ severity: "high", title: "Contato", detail: "pessoa@example.invalid" }] },
      { ...safe(), recommendedActions: [{ priority: 1, action: "Aplique botox", rationale: "Ação individual." }] },
      { ...safe(), executiveSummary: "Receita realizada de R$ 999,00." },
    ]) {
      await assert.rejects(generateClinicSummary({ snapshot, model: "test/model", tenantHash: "opaque", environment: "test",
        generate: async () => ({ output }) }), { message: "AI_UNAVAILABLE" });
    }
    await assert.rejects(generateClinicSummary({ snapshot, model: "test/model", tenantHash: "opaque", environment: "test",
      generate: async () => ({ output: { title: "Incompleto" } }) }), { message: "AI_UNAVAILABLE" });
    assert.equal(logs.some(([, entry]) => entry.status === "ok"), false);
    assert.equal(logs.filter(([, entry]) => entry.errorCode === "AI_UNSAFE_OUTPUT").length, 4);
    const serialized = JSON.stringify(logs);
    for (const fragment of ["Prescreva", "medicamento", "pessoa@example.invalid", "Aplique botox", "999,00", "Incompleto"]) {
      assert.equal(serialized.includes(fragment), false);
    }
  } finally {
    console.info = previousInfo;
    console.warn = previousWarn;
  }
});

test("schema rejects extra fields, oversized strings and malformed nested content", () => {
  assert.equal(clinicSummarySchema.safeParse({ ...safe(), extra: "untrusted" }).success, false);
  assert.equal(clinicSummarySchema.safeParse({ ...safe(), title: "x".repeat(101) }).success, false);
  assert.equal(clinicSummarySchema.safeParse({ ...safe(), alerts: [{ severity: "invalid", title: "x", detail: "y" }] }).success, false);
  assert.equal(clinicSummarySchema.safeParse({ ...safe(), recommendedActions: [{ priority: 1, action: "", rationale: "x" }] }).success, false);
});
