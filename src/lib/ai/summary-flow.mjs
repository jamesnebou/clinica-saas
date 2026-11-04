import { validateSummaryDays } from "./clinic-summary-core.mjs";

export async function runClinicSummary({ days, clinic, user, limiter, snapshot, generate, model }) {
  validateSummaryDays(days);
  if (!clinic?.id || !user?.id) throw new Error("AI_FORBIDDEN");
  if (!model) throw new Error("AI_NOT_CONFIGURED");
  const limit = await limiter(clinic.id);
  if (!limit?.allowed || limit.unavailable) throw new Error(limit?.limited ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE");
  const data = await snapshot(clinic, days);
  const analysis = await generate(data, model);
  return { analysis, period: data.period, generatedAt: new Date().toISOString(),
    sources: ["Agenda", "Financeiro", "Clientes", ...(data.procedures?.length ? ["Procedimentos"] : [])] };
}
