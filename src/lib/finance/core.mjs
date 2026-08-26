const RECEIVABLE_CLOSED = new Set(["pago", "cancelado", "estornado"]);
const CASH_IN_TYPES = new Set(["entrada", "transferencia_entrada", "ajuste_entrada"]);
const CASH_OUT_TYPES = new Set(["saida", "transferencia_saida", "ajuste_saida", "estorno"]);
const TRANSFER_TYPES = new Set(["transferencia_entrada", "transferencia_saida"]);

export function toCents(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) throw new TypeError("Valor monetário inválido.");
  return Math.round((number + Number.EPSILON) * 100);
}

export function fromCents(value) {
  return Number((Number(value || 0) / 100).toFixed(2));
}

export function splitInstallments(total, quantity) {
  const totalCents = toCents(total);
  const count = Math.max(1, Math.trunc(Number(quantity || 1)));
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => fromCents(base + (index < remainder ? 1 : 0)));
}

export function openAmount(record) {
  const total = toCents(record?.valor_total ?? record?.valor_original ?? 0);
  const received = toCents(record?.valor_recebido ?? record?.valor_liquidado ?? 0);
  return fromCents(Math.max(0, total - received));
}

export function receivableStatus(record, today = new Date().toISOString().slice(0, 10)) {
  const current = String(record?.status || "aberto");
  if (["cancelado", "estornado", "renegociado"].includes(current)) return current;
  const open = toCents(openAmount(record));
  if (open === 0) return "pago";
  if (record?.vencimento && record.vencimento < today) return "vencido";
  if (toCents(record?.valor_recebido) > 0) return "parcial";
  return "aberto";
}

export function agingBucket(dueDate, today = new Date().toISOString().slice(0, 10)) {
  if (!dueDate || dueDate >= today) return "a_vencer";
  const due = new Date(`${dueDate}T12:00:00Z`);
  const reference = new Date(`${today}T12:00:00Z`);
  const days = Math.floor((reference - due) / 86400000);
  if (days <= 7) return "1_7";
  if (days <= 15) return "8_15";
  if (days <= 30) return "16_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "mais_90";
}

export function calculateCommission({ baseValue, type = "percentual", rate = 0, fixedValue = 0 }) {
  const base = toCents(baseValue);
  if (type === "fixo") return fromCents(Math.min(base, toCents(fixedValue)));
  const percentage = Math.max(0, Number(rate || 0));
  return fromCents(Math.round(base * percentage) / 100);
}

export function summarizeReceivables(records = [], today) {
  const result = { total: 0, aberto: 0, vencido: 0, recebido: 0, inadimplencia: 0, clientes_inadimplentes: 0 };
  const overdueClients = new Set();
  for (const record of records) {
    if (RECEIVABLE_CLOSED.has(record?.status) && record?.status !== "pago") continue;
    const total = toCents(record?.valor_total ?? record?.valor_original);
    const received = toCents(record?.valor_recebido);
    const open = Math.max(0, total - received);
    const status = receivableStatus(record, today);
    result.total += total;
    result.recebido += received;
    result.aberto += open;
    if (status === "vencido") {
      result.vencido += open;
      if (record?.cliente_id) overdueClients.add(record.cliente_id);
    }
  }
  result.inadimplencia = result.aberto > 0 ? (result.vencido / result.aberto) * 100 : 0;
  result.clientes_inadimplentes = overdueClients.size;
  for (const key of ["total", "aberto", "vencido", "recebido"]) result[key] = fromCents(result[key]);
  return result;
}

export function summarizeCashFlow(movements = []) {
  let entries = 0;
  let exits = 0;
  let transfers = 0;
  let fees = 0;
  for (const movement of movements) {
    const type = String(movement?.tipo || "");
    const net = toCents(movement?.valor_liquido ?? movement?.valor_bruto);
    fees += toCents(movement?.taxa || 0);
    if (TRANSFER_TYPES.has(type)) transfers += type === "transferencia_entrada" ? net : -net;
    else if (CASH_IN_TYPES.has(type)) entries += net;
    else if (CASH_OUT_TYPES.has(type)) exits += net;
  }
  return {
    entradas: fromCents(entries),
    saidas: fromCents(exits),
    saldo: fromCents(entries - exits),
    transferencias_liquidas: fromCents(transfers),
    taxas: fromCents(fees),
  };
}

export function buildManagerialDre(entries = []) {
  const totals = new Map();
  for (const entry of entries) {
    const group = String(entry?.grupo_dre || "outras_despesas");
    totals.set(group, (totals.get(group) || 0) + toCents(entry?.valor || 0));
  }
  const value = (key) => totals.get(key) || 0;
  const gross = value("receita_bruta");
  const deductions = value("deducoes");
  const net = gross - deductions;
  const variableCosts = value("custos_variaveis");
  const contribution = net - variableCosts;
  const operatingExpenses = value("despesas_operacionais");
  const operating = contribution - operatingExpenses;
  const other = value("outras_receitas") - value("outras_despesas");
  return {
    receita_bruta: fromCents(gross),
    deducoes: fromCents(deductions),
    receita_liquida: fromCents(net),
    custos_variaveis: fromCents(variableCosts),
    margem_contribuicao: fromCents(contribution),
    despesas_operacionais: fromCents(operatingExpenses),
    resultado_operacional: fromCents(operating),
    outras_receitas_despesas: fromCents(other),
    resultado_gerencial: fromCents(operating + other),
    margem_percentual: net > 0 ? (contribution / net) * 100 : 0,
  };
}
