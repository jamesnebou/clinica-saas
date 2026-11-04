import { buildClinicSummaryModelPayload } from "./summary-generation.mjs";
import { chatRequestSchema, classifyManagementQuestion, confirmedChatMetrics } from "./chat-intents.mjs";

export async function runClinicChat({ body, clinic, user, model, limiter, snapshot, generate }) {
  const input = chatRequestSchema.parse(body);
  if (!clinic?.id || !user?.id) throw new Error("AI_FORBIDDEN");
  const classified = classifyManagementQuestion(input.question, input.lastIntent);
  if (!classified.intent) return { type: "local", message: classified.message, lastIntent: input.lastIntent || null };
  if (!model) throw new Error("AI_NOT_CONFIGURED");

  // Chat and summary deliberately share the same persistent quota until a separate policy is introduced.
  const limit = await limiter(clinic.id);
  if (!limit?.allowed || limit.unavailable) throw new Error(limit?.limited ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
  const data = await snapshot(clinic, input.days);
  const payload = buildClinicSummaryModelPayload(data);
  const answer = await generate({ payload, intent: classified.intent, followUp: classified.followUp, model });
  return {
    type: "analysis",
    intent: classified.intent,
    lastIntent: classified.intent,
    period: { days: input.days },
    confirmed: confirmedChatMetrics(payload, classified.intent),
    interpretation: answer.interpretation,
    nextSteps: answer.nextSteps,
  };
}
