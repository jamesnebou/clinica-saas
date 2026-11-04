import { buildClinicSummaryModelPayload } from "./summary-generation.mjs";
import { chatRequestSchema, classifyManagementQuestion, confirmedChatMetrics, directChatMetrics } from "./chat-intents.mjs";
import { agendaRequestForQuestion } from "./agenda-details.mjs";

export async function runClinicChat({ body, clinic, agendaClinic = clinic, user, model, limiter, snapshot, generate, agendaAllowed, agendaLookup }) {
  const input = chatRequestSchema.parse(body);
  if (!clinic?.id || !user?.id) throw new Error("AI_FORBIDDEN");
  const classified = classifyManagementQuestion(input.question, input.lastIntent);
  if (!classified.intent) return { type: "local", message: classified.message, lastIntent: input.lastIntent || null };
  if (classified.intent === "agenda_details") {
    if (!await agendaAllowed?.()) throw new Error("AI_FORBIDDEN");
    if (agendaClinic?.id !== clinic.id) throw new Error("AI_FORBIDDEN");
    const request = agendaRequestForQuestion(input.question, input.agendaContext, agendaClinic);
    if (!request) return { type: "local", message: "Informe uma data válida ou um intervalo de até 7 dias.", lastIntent: input.lastIntent || null };
    const limit = await limiter(clinic.id);
    if (!limit?.allowed || limit.unavailable) throw new Error(limit?.limited ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
    return agendaLookup(clinic, request, input.agendaPage || 0);
  }
  const directRequested = directChatMetrics(input.question, classified.intent, []) !== null;
  if (!model && !directRequested) throw new Error("AI_NOT_CONFIGURED");
  // Chat and summary deliberately share the same persistent quota until a separate policy is introduced.
  const limit = await limiter(clinic.id);
  if (!limit?.allowed || limit.unavailable) throw new Error(limit?.limited ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
  const data = await snapshot(clinic, input.days);
  const payload = buildClinicSummaryModelPayload(data);
  const confirmed = confirmedChatMetrics(payload, classified.intent);
  const direct = directChatMetrics(input.question, classified.intent, confirmed);
  if (direct !== null) return { type: "analysis", intent: classified.intent, lastIntent: classified.intent, period: { days: input.days },
    confirmed: direct, interpretation: "", nextSteps: [] };
  const answer = await generate({ payload, intent: classified.intent, followUp: classified.followUp, model });
  return {
    type: "analysis",
    intent: classified.intent,
    lastIntent: classified.intent,
    period: { days: input.days },
    confirmed,
    interpretation: answer.interpretation,
    nextSteps: answer.nextSteps,
  };
}
