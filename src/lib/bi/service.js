import { buildDeterministicInsights } from "@/lib/domain/bi-core.mjs";
import { buildBIRpcParams } from "@/lib/domain/bi-query-core.mjs";
import { getWorkingPeriods, inactiveDateFor, weekdayFromDateKey } from "@/lib/clinic/schedule";

function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function availableMinutes(schedule, startKey, endKey, timeZone) {
  let total = 0;
  for (let key = startKey; key <= endKey; key = addDays(key, 1)) {
    if (inactiveDateFor(schedule, key, timeZone)) continue;
    for (const period of getWorkingPeriods(schedule, weekdayFromDateKey(key))) {
      total += Math.max(0, period.end - period.start);
    }
  }
  return total;
}

function withDerivedMetrics(data, clinic, period) {
  const schedule = clinic?.metadata?.horario_funcionamento || {};
  const currentAvailable = availableMinutes(schedule, period.current.startKey, period.current.endKey, period.timeZone);
  const previousAvailable = availableMinutes(schedule, period.previous.startKey, period.previous.endKey, period.timeZone);
  const current = data?.atual || {};
  const previous = data?.anterior || {};

  data.atual = {
    ...current,
    minutos_disponiveis: currentAvailable,
    taxa_ocupacao: currentAvailable > 0 ? Math.min(100, (Number(current.minutos_ocupados || 0) / currentAvailable) * 100) : null,
  };
  data.anterior = {
    ...previous,
    minutos_disponiveis: previousAvailable,
    taxa_ocupacao: previousAvailable > 0 ? Math.min(100, (Number(previous.minutos_ocupados || 0) / previousAvailable) * 100) : null,
  };
  data.insights = buildDeterministicInsights(data.atual, data.anterior);
  return data;
}

export async function getBIData({ supabase, clinic, period, filters = {} }) {
  const [biResult, financeCurrent, financePrevious] = await Promise.all([
    supabase.rpc("bi_resumo_clinica", buildBIRpcParams({ clinicId: clinic.id, period, filters })),
    supabase.rpc("finance_resumo_clinica", { p_clinica_id: clinic.id, p_inicio: period.current.startKey, p_fim: period.current.endKey }),
    supabase.rpc("finance_resumo_clinica", { p_clinica_id: clinic.id, p_inicio: period.previous.startKey, p_fim: period.previous.endKey }),
  ]);

  const { data, error } = biResult;

  if (error) return { data: null, error };
  const mergedData = data || {};
  if (!financeCurrent.error && financeCurrent.data) {
    mergedData.atual = { ...(mergedData.atual || {}), recebido: Number(financeCurrent.data.receber?.recebido || 0),
      pendente: Number(financeCurrent.data.receber?.aberto || 0), financeiro: financeCurrent.data };
  }
  if (!financePrevious.error && financePrevious.data) {
    mergedData.anterior = { ...(mergedData.anterior || {}), recebido: Number(financePrevious.data.receber?.recebido || 0),
      pendente: Number(financePrevious.data.receber?.aberto || 0), financeiro: financePrevious.data };
  }
  return { data: withDerivedMetrics(mergedData, clinic, period), error: null };
}

export async function getBIFilterOptions({ supabase, clinicId }) {
  const [professionals, procedures, segments, opportunities] = await Promise.all([
    supabase.from("profissionais").select("id, nome").eq("clinica_id", clinicId).eq("ativo", true).order("nome").limit(500),
    supabase.from("procedimentos").select("id, nome, categoria").eq("clinica_id", clinicId).eq("ativo", true).order("nome").limit(500),
    supabase.from("clinica_segmentos").select("principal, segmentos(slug, nome)").eq("clinica_id", clinicId).order("principal", { ascending: false }),
    supabase.from("crm_oportunidades").select("origem, source, medium").eq("clinica_id", clinicId).order("created_at", { ascending: false }).limit(1000),
  ]);
  const procedureRows = procedures.data || [];
  return {
    professionals: professionals.data || [],
    procedures: procedureRows,
    categories: [...new Set(procedureRows.map((item) => item.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    segments: segments.data || [],
    origins: [...new Set((opportunities.data || []).flatMap((item) => [item.source, item.origem]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    channels: [...new Set((opportunities.data || []).map((item) => item.medium).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

export async function getWhatsAppBI({ supabase, clinicId, period }) {
  const [messagesResult, clicksResult] = await Promise.all([
    supabase.from("whatsapp_messages").select("status,direction").eq("clinica_id", clinicId).gte("created_at", period.current.start.toISOString()).lt("created_at", period.current.end.toISOString()).limit(10000),
    supabase.from("eventos_analiticos").select("id", { count: "exact", head: true }).eq("clinica_id", clinicId).eq("event_name", "payment_link_clicked").gte("occurred_at", period.current.start.toISOString()).lt("occurred_at", period.current.end.toISOString()),
  ]);
  if (messagesResult.error && !["42P01", "PGRST205"].includes(messagesResult.error.code)) return { data: null, error: messagesResult.error };
  const messages = messagesResult.data || [];
  const outbound = messages.filter((item) => item.direction === "outbound");
  const count = (status) => outbound.filter((item) => item.status === status).length;
  return {
    data: {
      enviadas: outbound.length,
      entregues: count("delivered") + count("read"),
      lidas: count("read"),
      falhas: count("failed"),
      recebidas: messages.filter((item) => item.direction === "inbound").length,
      cliques_pagamento: clicksResult.count || 0,
    },
    error: null,
  };
}

export function serializeBIExport(data) {
  return {
    resumo: [
      ["Métrica", "Período atual", "Período anterior"],
      ["Receita prevista", data.atual?.previsto || 0, data.anterior?.previsto || 0],
      ["Receita recebida", data.atual?.recebido || 0, data.anterior?.recebido || 0],
      ["Pendente", data.atual?.pendente || 0, data.anterior?.pendente || 0],
      ["Atendimentos", data.atual?.atendimentos || 0, data.anterior?.atendimentos || 0],
      ["No-show (%)", data.atual?.taxa_no_show || 0, data.anterior?.taxa_no_show || 0],
      ["Conversão CRM (%)", data.atual?.taxa_conversao || 0, data.anterior?.taxa_conversao || 0],
    ],
    profissionais: [["Profissional", "Atendimentos", "Previsto", "Recebido", "Repasse"], ...(data.profissionais || []).map((item) => [item.nome, item.atendimentos, item.previsto, item.recebido, item.repasse])],
    procedimentos: [["Procedimento", "Quantidade", "Clientes únicos", "Previsto", "Recebido"], ...(data.procedimentos || []).map((item) => [item.nome, item.quantidade, item.clientes_unicos, item.previsto, item.recebido])],
  };
}
