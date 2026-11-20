import { createHash } from "node:crypto";
import { buildClinicSummaryModelPayload } from "./summary-generation.mjs";
import { chatMetricLabels, chatRequestSchema, classifyManagementQuestion, confirmedChatMetrics, directChatMetrics } from "./chat-intents.mjs";
import { agendaRequestForQuestion } from "./agenda-details.mjs";
import { buildChatPeriod, fallbackPeriodKey } from "./chat-periods.mjs";
import { reconcileChatPlan, safePlannerQuestion } from "./chat-planner.mjs";

export async function runClinicChat({ body, clinic, agendaClinic = clinic, user, model, limiter, snapshot, generate, planner, agendaAllowed, agendaLookup, now = new Date() }) {
  const input = chatRequestSchema.parse(body);
  if (!clinic?.id || !user?.id) throw new Error("AI_FORBIDDEN");
  const scopeKey = createHash("sha256").update("clinic-ai\0").update(user.id).update("\0").update(clinic.id).digest("hex");
  const previous = input.memory?.scopeKey === scopeKey ? input.memory : null;
  const lastIntent = input.memory && !previous ? null : input.lastIntent;
  if (!safePlannerQuestion(input.question)) return { type: "local", message: "Para proteger dados pessoais e clínicos, pergunte somente sobre indicadores agregados da clínica.", lastIntent: null };
  const fallback = classifyManagementQuestion(input.question, previous?.intent || lastIntent);
  const text = input.question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(?:quais|qual)\s+dias?\b.*\b(?:menos|mais)\b.*\bagend/.test(text)) {
    return { type: "local", message: "Ainda não tenho uma distribuição confiável de agendamentos por dia para essa comparação.", lastIntent: null };
  }
  if (/\b(?:segunda|2a|2ª)\s+recomendacao\b/.test(text) && previous) {
    return { type: "local", message: "Indique qual recomendação deseja aprofundar. Não mantenho o texto de recomendações anteriores como fonte de dados.", lastIntent: previous.intent };
  }
  if (!model && !fallback.intent && !/\b(?:data|dia)\s+de\s+hoje\b/.test(text)) {
    return { type: "local", message: fallback.message, lastIntent: lastIntent || null };
  }
  const limit = await limiter(clinic.id);
  if (!limit?.allowed || limit.unavailable) throw new Error(limit?.limited ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
  const prior = previous || (lastIntent ? { intent: lastIntent, periodKey: null, metric: null, objective: "analyze" } : null);
  const planned = reconcileChatPlan(input.question, await planner?.({ question: input.question, previous: prior, model }), prior);
  const intent = planned?.intent || (/\b(?:data|dia)\s+de\s+hoje\b/.test(text) ? "date" : fallback.intent);
  if (intent === "date") {
    const timeZone = buildChatPeriod(agendaClinic, "today", now).timezone;
    const date = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "long", year: "numeric" }).format(now);
    return { type: "local", message: `Hoje é ${date}.`, lastIntent: null };
  }
  if (!intent || intent === "clarify" || intent === "unsupported") {
    return { type: "local", message: intent === "unsupported" ? "Não tenho dados confiáveis para responder a essa pergunta." : fallback.message || "Qual indicador de gestão você deseja analisar?", lastIntent: lastIntent || null };
  }
  if (intent === "agenda_details") {
    if ((planned?.followUp || fallback.followUp) && !input.agendaContext) return { type: "local", message: "A quais agendamentos você se refere? Informe a data ou o período para consultar a agenda.", lastIntent: null };
    if (!await agendaAllowed?.()) throw new Error("AI_FORBIDDEN");
    if (agendaClinic?.id !== clinic.id) throw new Error("AI_FORBIDDEN");
    const request = agendaRequestForQuestion(input.question, input.agendaContext, agendaClinic, now);
    if (!request) return { type: "local", message: "Informe uma data válida ou um intervalo de até 7 dias.", lastIntent: lastIntent || null };
    return agendaLookup(clinic, request, input.agendaPage || 0);
  }
  const followUp = Boolean(planned?.followUp ?? fallback.followUp) && Boolean(prior?.intent) && prior.intent === intent;
  const periodKey = planned?.periodKey && planned.periodKey !== "keep" ? planned.periodKey
    : fallbackPeriodKey(input.question, followUp ? previous?.periodKey : null, followUp && previous ? previous.days : input.days);
  if (periodKey === "tomorrow" && intent !== "agenda") return { type: "local", message: "A consulta de amanhã está disponível apenas para a Agenda.", lastIntent: intent };
  if (intent === "customers" && ["today", "yesterday", "tomorrow"].includes(periodKey)) {
    return { type: "local", message: "Ainda não consigo analisar clientes por dia. Posso consultar a agenda dessa data ou analisar clientes nos últimos 7 ou 30 dias.", lastIntent: intent };
  }
  const period = buildChatPeriod(agendaClinic, periodKey, now);
  const days = period.days;
  const data = await snapshot(clinic, periodKey);
  const payload = buildClinicSummaryModelPayload(data);
  let confirmed = confirmedChatMetrics(payload, intent);
  const selected = planned?.metric && planned.metric !== "none" ? confirmed.filter((item) => item.label === chatMetricLabels[planned.metric]) : null;
  const direct = selected?.length ? selected : planned ? null : directChatMetrics(input.question, intent, confirmed);
  const metric = direct?.length === 1 ? direct[0].label : followUp && previous && confirmed.some((item) => item.label === previous.metric) ? previous.metric : null;
  const objective = planned?.objective || (/\b(?:comparad\w*|periodo\s+anterior)\b/.test(text) ? "compare"
    : /\b(?:melhorar|recomendacao)\b/.test(text) ? "improve" : followUp ? "explain" : "analyze");
  const memory = { scopeKey, intent, days: input.days, periodKey, metric, objective };
  if (selected?.length && objective !== "compare") confirmed = selected;
  if (objective === "compare" && !["agenda", "finance", "trends", "overview"].includes(intent)) {
    return { type: "local", message: "Ainda não há comparação confirmada para esse assunto. Escolha agenda ou entradas financeiras.", lastIntent: intent, memory };
  }
  if (objective === "compare") {
    const trends = confirmedChatMetrics(payload, "trends").filter((item) => intent === "overview" || intent === "trends"
      || intent === "finance" && metric !== "Saídas realizadas" && item.label === "Variação de entradas"
      || intent === "agenda" && item.label === "Variação de agendamentos");
    if (!trends.length) return { type: "local", message: "Não há dados suficientes para comparar esse indicador com o período anterior.", lastIntent: intent, memory };
    confirmed = trends;
  }
  if (direct !== null && objective === "analyze") return { type: "analysis", intent, lastIntent: intent, period: { days, key: periodKey, label: period.label }, memory,
    confirmed: direct, interpretation: intent === "finance" ? "Critério: entradas realizadas líquidas, não faturamento previsto nem lucro." : "", nextSteps: [] };
  if (!model) return { type: "analysis", intent, lastIntent: intent, period: { days, key: periodKey, label: period.label }, memory,
    confirmed, interpretation: "", nextSteps: [], notice: "A interpretação adicional está indisponível. Os indicadores confirmados continuam disponíveis." };
  let answer;
  try {
    answer = await generate({ payload, intent, followUp, focus: { metric, objective }, days, model });
  } catch (error) {
    return { type: "analysis", intent, lastIntent: intent, period: { days, key: periodKey, label: period.label }, memory,
      confirmed, interpretation: "", nextSteps: [], notice: error?.message === "AI_UNSAFE_OUTPUT"
        ? "A interpretação adicional não pôde ser exibida com segurança. Os indicadores confirmados continuam disponíveis."
        : "A interpretação adicional está indisponível. Os indicadores confirmados continuam disponíveis." };
  }
  return {
    type: "analysis",
    intent, lastIntent: intent,
    period: { days, key: periodKey, label: period.label }, memory,
    confirmed,
    interpretation: intent === "finance" ? `Critério: entradas realizadas líquidas, não faturamento previsto nem lucro. ${answer.interpretation}` : answer.interpretation,
    nextSteps: answer.nextSteps,
    analysis: answer.analysis || null,
  };
}
