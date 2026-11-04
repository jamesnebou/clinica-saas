import test from "node:test";
import assert from "node:assert/strict";
import { summarizeClinicRows } from "../src/lib/ai/clinic-summary-core.mjs";
import { generateClinicSummary } from "../src/lib/ai/summary-generation.mjs";

const period = { days: 7, start: "2026-10-08", end: "2026-10-15", previousStart: "2026-10-01", previousEnd: "2026-10-08" };
const movement = (tipo, valor_liquido, data_movimento = "2026-10-10", taxa = 0) => ({ tipo, valor_liquido, data_movimento, taxa });
const summarize = (movements) => summarizeClinicRows({ period, appointments: [], movements, customerTotal: 0,
  newCustomers: 0, procedureNames: new Map(), upcoming: 0 });

test("AI realized totals match Financeiro and finance_resumo_clinica movement types", () => {
  const cases = [
    ["entrada", 100, 100, 0], ["saida", 20, 0, 20], ["ajuste_entrada", 25, 25, 0],
    ["ajuste_saida", 5, 0, 5], ["estorno", 10, 0, 10],
  ];
  for (const [type, amount, entries, exits] of cases) {
    const { finance } = summarize([movement(type, amount)]);
    assert.deepEqual(finance, { realizedEntries: entries, realizedExits: exits }, type);
  }
  assert.deepEqual(summarize(cases.map(([type, amount]) => movement(type, amount))).finance,
    { realizedEntries: 125, realizedExits: 35 });
});

test("received trend includes adjustments in both periods", () => {
  const result = summarize([
    movement("entrada", 40, "2026-10-03"), movement("ajuste_entrada", 10, "2026-10-03"),
    movement("entrada", 100), movement("ajuste_entrada", 25), movement("saida", 20),
    movement("ajuste_saida", 5), movement("estorno", 10),
    movement("entrada", 999, "2026-10-15"),
  ]);
  assert.deepEqual(result.finance, { realizedEntries: 125, realizedExits: 35 });
  assert.equal(result.trends.receivedPercent, 150);
});

test("empty periods, decimal money, signed values and fees follow SQL sum semantics", () => {
  assert.deepEqual(summarize([]).finance, { realizedEntries: 0, realizedExits: 0 });
  assert.equal(summarize([]).trends.receivedPercent, null);
  const result = summarize([
    movement("entrada", "0.10", "2026-10-10", "0.02"),
    movement("ajuste_entrada", "0.20"), movement("saida", "1.10"),
    movement("ajuste_saida", "0.25"), movement("estorno", "-0.05"),
  ]);
  assert.deepEqual(result.finance, { realizedEntries: 0.3, realizedExits: 1.3 });
  assert.equal(result.trends.receivedPercent, null);
});

test("model instructions preserve realized cash semantics without another fee deduction", async () => {
  const snapshot = summarize([]);
  let system;
  await generateClinicSummary({ snapshot, model: "test/model", tenantHash: "opaque", environment: "test",
    generate: async (options) => {
      system = options.system;
      return { output: { title: "Resumo", executiveSummary: "Sem movimentos no período.", highlights: [], alerts: [],
        opportunities: [], recommendedActions: [] } };
    },
  });
  assert.match(system, /ajustes de entrada/);
  assert.match(system, /estornos/);
  assert.match(system, /não desconte taxas novamente/);
  assert.match(system, /ausência de base comparável/);
});
