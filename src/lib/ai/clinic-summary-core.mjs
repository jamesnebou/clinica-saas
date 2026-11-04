export function validateSummaryDays(value) {
  if (value === 7 || value === 30) return value;
  throw new Error("INVALID_PERIOD");
}

export function sanitizeProcedureLabel(value) {
  const label = String(value || "")
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[contato]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-?\d{2}\b/g, "[documento]")
    .replace(/(?:\+?\d{1,3}[\s().-]*)?(?:\(?\d{2}\)?[\s().-]*)?\d{4,5}[\s.-]*\d{4}\b/g, "[contato]")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return label || "Procedimento sem nome";
}

export function summarizeClinicRows({ period, appointments, movements, customerTotal, newCustomers, procedureNames, upcoming }) {
  const current = appointments.filter((row) => row.inicio >= period.start && row.inicio < period.end);
  const previous = appointments.filter((row) => row.inicio >= period.previousStart && row.inicio < period.start);
  const count = (rows, status) => rows.filter((row) => row.status === status).length;
  const money = (n) => Math.round(n * 100) / 100;
  const totals = (rows) => ({
    entries: money(rows.filter((row) => row.tipo === "entrada").reduce((sum, row) => sum + Number(row.valor_liquido || 0), 0)),
    exits: money(rows.filter((row) => row.tipo === "saida").reduce((sum, row) => sum + Number(row.valor_liquido || 0), 0)),
  });
  const finance = totals(movements.filter((row) => row.data_movimento >= period.start && row.data_movimento < period.end));
  const previousFinance = totals(movements.filter((row) => row.data_movimento >= period.previousStart && row.data_movimento < period.start));
  const change = (now, before) => before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null;
  const byProcedure = new Map();
  for (const row of current) {
    if (row.status !== "concluido" || !row.procedimento_id) continue;
    byProcedure.set(row.procedimento_id, (byProcedure.get(row.procedimento_id) || 0) + 1);
  }
  return {
    period,
    agenda: {
      total: current.length, completed: count(current, "concluido"), confirmed: count(current, "confirmado"),
      canceled: count(current, "cancelado"), noShows: count(current, "faltou"), upcoming,
    },
    finance: { realizedEntries: finance.entries, realizedExits: finance.exits },
    customers: { total: customerTotal, newInPeriod: newCustomers },
    procedures: [...byProcedure.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, count]) => ({ name: sanitizeProcedureLabel(procedureNames.get(id)), appointments: count })),
    trends: {
      appointmentsPercent: change(current.length, previous.length),
      receivedPercent: change(finance.entries, previousFinance.entries),
      noShowRatePercent: current.length ? Math.round(count(current, "faltou") / current.length * 1000) / 10 : null,
    },
  };
}
