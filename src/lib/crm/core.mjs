export const CRM_TEMPERATURES = [
  { value: "frio", label: "Frio" },
  { value: "morno", label: "Morno" },
  { value: "quente", label: "Quente" },
];

export const CRM_ACTIVITY_TYPES = [
  ["ligacao", "Ligação"], ["whatsapp", "WhatsApp"], ["email", "E-mail"],
  ["reuniao", "Reunião"], ["avaliacao", "Avaliação"], ["follow_up", "Follow-up"],
  ["tarefa", "Tarefa"], ["nota", "Nota"], ["outro", "Outro"],
];

export const CRM_ORIGINS = [
  ["site", "Site"], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"],
  ["google", "Google"], ["trafego_pago", "Tráfego pago"], ["indicacao", "Indicação"], ["outro", "Outro"],
];

export function normalizeCrmPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function normalizeCrmEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function opportunityProbability(opportunity, stage) {
  return Number(opportunity?.probabilidade_override ?? stage?.probabilidade ?? 0);
}

export function calculateCrmMetrics(opportunities = [], stages = [], activities = [], now = new Date()) {
  const stageMap = new Map(stages.map((stage) => [stage.id, stage]));
  const open = opportunities.filter((item) => stageMap.get(item.stage_id)?.tipo === "open");
  const won = opportunities.filter((item) => stageMap.get(item.stage_id)?.tipo === "won");
  const lost = opportunities.filter((item) => stageMap.get(item.stage_id)?.tipo === "lost");
  const closed = won.length + lost.length;
  return {
    openCount: open.length,
    pipelineValue: open.reduce((sum, item) => sum + Number(item.valor_estimado || 0), 0),
    weightedValue: open.reduce((sum, item) => sum + Number(item.valor_estimado || 0) * opportunityProbability(item, stageMap.get(item.stage_id)) / 100, 0),
    wonCount: won.length,
    lostCount: lost.length,
    conversionRate: closed ? (won.length / closed) * 100 : 0,
    averageTicket: won.length ? won.reduce((sum, item) => sum + Number(item.valor_fechado ?? item.valor_estimado ?? 0), 0) / won.length : 0,
    overdueActivities: activities.filter((item) => item.status === "pending" && item.due_at && new Date(item.due_at) < now).length,
    withoutNextActivity: open.filter((item) => !item.next_activity_at).length,
  };
}

export function legacyStatusForStage(stage) {
  if (stage?.tipo === "won") return "convertido";
  if (stage?.tipo === "lost") return "perdido";
  if (stage?.semantic_key === "evaluation_scheduled") return "avaliacao_marcada";
  if (stage?.semantic_key === "negotiation") return "em_negociacao";
  return "lead";
}
