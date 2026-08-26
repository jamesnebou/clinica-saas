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
  const [accounts, categories, centers, suppliers, settings, professionals, procedures, commissionRules, recurrences] = await Promise.all([
    supabase.from("finance_contas").select("*").eq("clinica_id", clinicId).order("nome"),
    supabase.from("finance_categorias").select("*").eq("clinica_id", clinicId).order("nome"),
    supabase.from("finance_centros_custo").select("*").eq("clinica_id", clinicId).order("nome"),
    supabase.from("finance_fornecedores").select("*").eq("clinica_id", clinicId).order("nome"),
    supabase.from("finance_configuracoes").select("*").eq("clinica_id", clinicId).maybeSingle(),
    supabase.from("profissionais").select("id,nome,comissao_percentual").eq("clinica_id", clinicId).eq("ativo", true).order("nome"),
    supabase.from("procedimentos").select("id,nome").eq("clinica_id", clinicId).eq("ativo", true).order("nome"),
    supabase.from("finance_comissao_regras").select("*").eq("clinica_id", clinicId).order("prioridade", { ascending: false }),
    supabase.from("finance_recorrencias").select("*").eq("clinica_id", clinicId).order("proximo_vencimento"),
  ]);
  const results = [accounts, categories, centers, suppliers, settings, professionals, procedures, commissionRules, recurrences];
  const firstError = results.map((result) => result.error).find(Boolean);
  if (isFinanceSchemaMissing(firstError)) return { available: false, accounts: [], categories: [], centers: [], suppliers: [], professionals: [], procedures: [], commissionRules: [], recurrences: [], settings: null };
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
    settings: settings.data,
  };
}

export function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
