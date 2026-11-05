import { buildClinicSummaryModelPayload } from "./summary-generation.mjs";
import { chatRequestSchema, classifyManagementQuestion, confirmedChatMetrics, directChatMetrics } from "./chat-intents.mjs";
import { agendaRequestForQuestion } from "./agenda-details.mjs";

export async function runClinicChat({ body, clinic, agendaClinic = clinic, user, model, limiter, snapshot, generate, agendaAllowed, agendaLookup }) {
  const input = chatRequestSchema.parse(body);
  if (!clinic?.id || !user?.id) throw new Error("AI_FORBIDDEN");
  const previous = input.memory;
  const classified = classifyManagementQuestion(input.question, previous?.intent || input.lastIntent);
  if (!classified.intent) return { type: "local", message: classified.message, lastIntent: input.lastIntent || null };
  if (classified.intent === "agenda_details") {
    if (classified.followUp && !input.agendaContext) return { type: "local", message: "A quais agendamentos você se refere? Informe a data ou o período para consultar a agenda.", lastIntent: null };
    if (!await agendaAllowed?.()) throw new Error("AI_FORBIDDEN");
    if (agendaClinic?.id !== clinic.id) throw new Error("AI_FORBIDDEN");
    const request = agendaRequestForQuestion(input.question, input.agendaContext, agendaClinic);
    if (!request) return { type: "local", message: "Informe uma data válida ou um intervalo de até 7 dias.", lastIntent: input.lastIntent || null };
    const limit = await limiter(clinic.id);
    if (!limit?.allowed || limit.unavailable) throw new Error(limit?.limited ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
    return agendaLookup(clinic, request, input.agendaPage || 0);
  }
  const text = input.question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const followUp = classified.followUp && (!previous || previous.intent === classified.intent);
  if (followUp && /\b(?:segunda|2a|2ª)\s+recomendacao\b/.test(text)) {
    return { type: "local", message: "Indique qual recomendação deseja aprofundar. Não mantenho o texto de recomendações anteriores como fonte de dados.", lastIntent: classified.intent };
  }
  const days = followUp && previous ? previous.days : input.days;
  const directRequested = directChatMetrics(input.question, classified.intent, []) !== null;
  if (!model && !directRequested) throw new Error("AI_NOT_CONFIGURED");
  // Chat and summary deliberately share the same persistent quota until a separate policy is introduced.
  const limit = await limiter(clinic.id);
  if (!limit?.allowed || limit.unavailable) throw new Error(limit?.limited ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
  const data = await snapshot(clinic, days);
  const payload = buildClinicSummaryModelPayload(data);
  let confirmed = confirmedChatMetrics(payload, classified.intent);
  const direct = directChatMetrics(input.question, classified.intent, confirmed);
  const metric = direct?.length === 1 ? direct[0].label : followUp && previous && confirmed.some((item) => item.label === previous.metric) ? previous.metric : null;
  const objective = /\b(?:comparad\w*|periodo\s+anterior)\b/.test(text) ? "compare"
    : /\b(?:melhorar|recomendacao)\b/.test(text) ? "improve" : followUp ? "explain" : "analyze";
  const memory = { intent: classified.intent, days, metric, objective };
  if (objective === "compare" && !["agenda", "finance", "trends", "overview"].includes(classified.intent)) {
    return { type: "local", message: "Ainda não há comparação confirmada para esse assunto. Escolha agenda ou entradas financeiras.", lastIntent: classified.intent, memory };
  }
  if (objective === "compare") {
    const trends = confirmedChatMetrics(payload, "trends").filter((item) => classified.intent === "overview" || classified.intent === "trends"
      || classified.intent === "finance" && item.label === "Variação de entradas"
      || classified.intent === "agenda" && item.label === "Variação de agendamentos");
    if (!trends.length) return { type: "local", message: "Não há dados suficientes para comparar esse indicador com o período anterior.", lastIntent: classified.intent, memory };
    confirmed = trends;
  }
  if (direct !== null) return { type: "analysis", intent: classified.intent, lastIntent: classified.intent, period: { days }, memory,
    confirmed: direct, interpretation: "", nextSteps: [] };
  let answer;
  try {
    answer = await generate({ payload, intent: classified.intent, followUp, focus: { metric, objective }, days, model });
  } catch (error) {
    if (error?.message !== "AI_UNSAFE_OUTPUT") throw error;
    return { type: "analysis", intent: classified.intent, lastIntent: classified.intent, period: { days }, memory,
      confirmed, interpretation: "", nextSteps: [], notice: "A interpretação adicional não pôde ser exibida com segurança. Os indicadores confirmados continuam disponíveis." };
  }
  return {
    type: "analysis",
    intent: classified.intent,
    lastIntent: classified.intent,
    period: { days }, memory,
    confirmed,
    interpretation: answer.interpretation,
    nextSteps: answer.nextSteps,
    analysis: answer.analysis || null,
  };
}
