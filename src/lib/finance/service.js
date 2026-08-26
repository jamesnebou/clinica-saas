import { createClient } from "@/lib/supabase/server";

const MISSING_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

export function isFinanceSchemaMissing(error) {
  return Boolean(error && (MISSING_CODES.has(error.code) || /finance_|schema cache/i.test(error.message || "")));
}

export function monthPeriod(month) {
  const safe = /^\d{4}-\d{2}$/.test(month || "") ? month : new Date().toISOString().slice(0, 7);
  const start = `${safe}-01`;
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return { month: safe, start, end: date.toISOString().slice(0, 10) };
}

export async function getFinanceSummary(clinicId, period) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_resumo_clinica", {
    p_clinica_id: clinicId, p_inicio: period.start, p_fim: period.end,
  });
  if (isFinanceSchemaMissing(error)) return { available: false, data: null };
  if (error) throw error;
  return { available: true, data: data || {} };
}

function sumOpen(rows, totalKey, paidKey) {
  return rows.reduce((total, row) => total + Math.max(0, Number(row[totalKey] || 0) - Number(row[paidKey] || 0)), 0);
}

export async function getFinanceCashFlow(clinicId, period) {
  const supabase = await createClient();
  const [summary, movements, receivableInstallments, payableInstallments, receivables, payables, allReceivableInstallments, allPayableInstallments] = await Promise.all([
    getFinanceSummary(clinicId, period),
    supabase.from("finance_movimentos").select("id,tipo,descricao,valor_liquido,taxa,data_movimento").eq("clinica_id", clinicId).gte("data_movimento", `${period.start}T00:00:00`).lte("data_movimento", `${period.end}T23:59:59.999`).order("data_movimento"),
    supabase.from("finance_recebivel_parcelas").select("id,recebivel_id,vencimento,valor,valor_liquidado,status").eq("clinica_id", clinicId).gte("vencimento", period.start).lte("vencimento", period.end).not("status", "in", "(pago,cancelado,estornado)").order("vencimento"),
    supabase.from("finance_pagavel_parcelas").select("id,pagavel_id,vencimento,valor,valor_liquidado,status").eq("clinica_id", clinicId).gte("vencimento", period.start).lte("vencimento", period.end).not("status", "in", "(pago,cancelado,estornado)").order("vencimento"),
    supabase.from("finance_recebiveis").select("id,descricao,vencimento,valor_total,valor_recebido,status").eq("clinica_id", clinicId).gte("vencimento", period.start).lte("vencimento", period.end).not("status", "in", "(pago,cancelado,estornado)").order("vencimento"),
    supabase.from("finance_pagaveis").select("id,descricao,vencimento,valor_total,valor_pago,status").eq("clinica_id", clinicId).gte("vencimento", period.start).lte("vencimento", period.end).not("status", "in", "(pago,cancelado,estornado)").order("vencimento"),
    supabase.from("finance_recebivel_parcelas").select("recebivel_id").eq("clinica_id", clinicId).limit(10000),
    supabase.from("finance_pagavel_parcelas").select("pagavel_id").eq("clinica_id", clinicId).limit(10000),
  ]);
  const results = [movements, receivableInstallments, payableInstallments, receivables, payables, allReceivableInstallments, allPayableInstallments];
  const firstError = results.map((result) => result.error).find(Boolean);
  if (!summary.available || isFinanceSchemaMissing(firstError)) return { available: false, summary: null, rows: [] };
  if (firstError) throw firstError;

  const receivableParentsWithInstallments = new Set((allReceivableInstallments.data || []).map((row) => row.recebivel_id));
  const payableParentsWithInstallments = new Set((allPayableInstallments.data || []).map((row) => row.pagavel_id));
  const receivableFallback = (receivables.data || []).filter((row) => !receivableParentsWithInstallments.has(row.id));
  const payableFallback = (payables.data || []).filter((row) => !payableParentsWithInstallments.has(row.id));
  const projectedEntries = sumOpen(receivableInstallments.data || [], "valor", "valor_liquidado") + sumOpen(receivableFallback, "valor_total", "valor_recebido");
  const projectedExits = sumOpen(payableInstallments.data || [], "valor", "valor_liquidado") + sumOpen(payableFallback, "valor_total", "valor_pago");
  const realized = summary.data?.caixa || {};
  const rows = [
    ...(movements.data || []).map((row) => ({ id: `mov-${row.id}`, date: row.data_movimento.slice(0, 10), description: row.descricao, nature: row.tipo, status: "realizado", entry: ["entrada", "ajuste_entrada"].includes(row.tipo) ? Number(row.valor_liquido || 0) : 0, exit: ["saida", "ajuste_saida", "estorno"].includes(row.tipo) ? Number(row.valor_liquido || 0) : 0 })),
    ...(receivableInstallments.data || []).map((row) => ({ id: `ri-${row.id}`, date: row.vencimento, description: `Recebimento previsto · parcela`, nature: "receber", status: "projetado", entry: Math.max(0, Number(row.valor || 0) - Number(row.valor_liquidado || 0)), exit: 0 })),
    ...receivableFallback.map((row) => ({ id: `rf-${row.id}`, date: row.vencimento, description: row.descricao, nature: "receber", status: "projetado", entry: Math.max(0, Number(row.valor_total || 0) - Number(row.valor_recebido || 0)), exit: 0 })),
    ...(payableInstallments.data || []).map((row) => ({ id: `pi-${row.id}`, date: row.vencimento, description: `Pagamento previsto · parcela`, nature: "pagar", status: "projetado", entry: 0, exit: Math.max(0, Number(row.valor || 0) - Number(row.valor_liquidado || 0)) })),
    ...payableFallback.map((row) => ({ id: `pf-${row.id}`, date: row.vencimento, description: row.descricao, nature: "pagar", status: "projetado", entry: 0, exit: Math.max(0, Number(row.valor_total || 0) - Number(row.valor_pago || 0)) })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.status.localeCompare(b.status));
  return { available: true, summary: { realizedEntries: Number(realized.entradas || 0), realizedExits: Number(realized.saidas || 0), fees: Number(realized.taxas || 0), projectedEntries, projectedExits }, rows };
}

export async function getFinanceBudgetComparison(clinicId, period) {
  const supabase = await createClient();
  const competenceStart = `${period.month}-01`;
  const [budgets, facts, categories, centers] = await Promise.all([
    supabase.from("finance_orcamentos").select("id,categoria_id,centro_custo_id,valor_planejado,observacoes").eq("clinica_id", clinicId).eq("competencia", competenceStart),
    supabase.from("finance_competencias").select("categoria_id,centro_custo_id,tipo,valor,estornada").eq("clinica_id", clinicId).eq("competencia", competenceStart).eq("estornada", false),
    supabase.from("finance_categorias").select("id,nome,tipo,grupo_dre").eq("clinica_id", clinicId),
    supabase.from("finance_centros_custo").select("id,nome").eq("clinica_id", clinicId),
  ]);
  const firstError = [budgets, facts, categories, centers].map((result) => result.error).find(Boolean);
  if (isFinanceSchemaMissing(firstError)) return { available: false, rows: [], totals: {} };
  if (firstError) throw firstError;
  const categoryMap = new Map((categories.data || []).map((row) => [row.id, row]));
  const centerMap = new Map((centers.data || []).map((row) => [row.id, row.nome]));
  const actualMap = new Map();
  for (const fact of facts.data || []) {
    const key = `${fact.categoria_id}:${fact.centro_custo_id || "geral"}`;
    actualMap.set(key, (actualMap.get(key) || 0) + Number(fact.valor || 0));
  }
  const rows = (budgets.data || []).map((budget) => {
    const key = `${budget.categoria_id}:${budget.centro_custo_id || "geral"}`;
    const planned = Number(budget.valor_planejado || 0);
    const actual = actualMap.get(key) || 0;
    const category = categoryMap.get(budget.categoria_id);
    return { ...budget, category: category?.nome || "Categoria", categoryType: category?.tipo || "despesa", center: centerMap.get(budget.centro_custo_id) || "Geral", planned, actual, variance: actual - planned, execution: planned > 0 ? (actual / planned) * 100 : null };
  });
  return { available: true, rows, totals: { planned: rows.reduce((sum, row) => sum + row.planned, 0), actual: rows.reduce((sum, row) => sum + row.actual, 0) } };
}

export async function listFinanceRows(table, clinicId, { start, end, dateColumn, status, limit = 100 } = {}) {
  const supabase = await createClient();
  let query = supabase.from(table).select("*").eq("clinica_id", clinicId).limit(limit);
  if (start && dateColumn) query = query.gte(dateColumn, start);
  if (end && dateColumn) query = query.lte(dateColumn, end);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order(dateColumn || "created_at", { ascending: false });
  if (isFinanceSchemaMissing(error)) return { available: false, rows: [] };
  if (error) throw error;
  return { available: true, rows: data || [] };
}

export async function getFinanceSettings(clinicId) {
  const supabase = await createClient();
  const [accounts, categories, centers, suppliers, settings, professionals, procedures, commissionRules, recurrences, budgets] = await Promise.all([
    supabase.from("finance_contas").select("*").eq("clinica_id", clinicId).order("nome"),
    supabase.from("finance_categorias").select("*").eq("clinica_id", clinicId).order("nome"),
    supabase.from("finance_centros_custo").select("*").eq("clinica_id", clinicId).order("nome"),
    supabase.from("finance_fornecedores").select("*").eq("clinica_id", clinicId).order("nome"),
    supabase.from("finance_configuracoes").select("*").eq("clinica_id", clinicId).maybeSingle(),
    supabase.from("profissionais").select("id,nome,comissao_percentual").eq("clinica_id", clinicId).eq("ativo", true).order("nome"),
    supabase.from("procedimentos").select("id,nome").eq("clinica_id", clinicId).eq("ativo", true).order("nome"),
    supabase.from("finance_comissao_regras").select("*").eq("clinica_id", clinicId).order("prioridade", { ascending: false }),
    supabase.from("finance_recorrencias").select("*").eq("clinica_id", clinicId).order("proximo_vencimento"),
    supabase.from("finance_orcamentos").select("*").eq("clinica_id", clinicId).order("competencia", { ascending: false }).limit(120),
  ]);
  const results = [accounts, categories, centers, suppliers, settings, professionals, procedures, commissionRules, recurrences, budgets];
  const firstError = results.map((result) => result.error).find(Boolean);
  if (isFinanceSchemaMissing(firstError)) return { available: false, accounts: [], categories: [], centers: [], suppliers: [], professionals: [], procedures: [], commissionRules: [], recurrences: [], budgets: [], settings: null };
  if (firstError) throw firstError;
  return {
    available: true,
    accounts: accounts.data || [],
    categories: categories.data || [],
    centers: centers.data || [],
    suppliers: suppliers.data || [],
    professionals: professionals.data || [],
    procedures: procedures.data || [],
    commissionRules: commissionRules.data || [],
    recurrences: recurrences.data || [],
    budgets: budgets.data || [],
    settings: settings.data,
  };
}

export function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
