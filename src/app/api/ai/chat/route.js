import { getUserClinics, resolveClinicPlanEntitlements } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canUseClinicAi } from "@/lib/ai/access.mjs";
import { getClinicSummarySnapshot } from "@/lib/ai/clinic-summary-data";
import { runClinicChat } from "@/lib/ai/chat-flow.mjs";
import { generateClinicChatAnswer } from "@/lib/ai/chat-generation.mjs";
import { consumePublicRateLimit, hashPublicRateLimitValue, noStoreJson } from "@/lib/security/public-antiabuse";
import { readBoundedJson } from "@/lib/security/public-antiabuse-core.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return noStoreJson({ error: "AI_FORBIDDEN" }, { status: 403 });
  const context = await getUserClinics();
  if (!context.user) return noStoreJson({ error: "AI_FORBIDDEN" }, { status: 401 });
  const clinic = await resolveClinicPlanEntitlements(context);
  if (!canUseClinicAi(context, clinic)) return noStoreJson({ error: "AI_FORBIDDEN" }, { status: 403 });
  const body = await readBoundedJson(request, 1600);
  if (!body.ok) return noStoreJson({ error: "AI_INVALID_REQUEST" }, { status: body.status });
  try {
    const result = await runClinicChat({
      body: body.value,
      clinic,
      user: context.user,
      model: process.env.AI_GATEWAY_MODEL?.trim(),
      limiter: (clinicId) => consumePublicRateLimit({ scope: "ai_summary", headers: request.headers, tenantId: clinicId, target: clinicId }),
      snapshot: async (currentClinic, days) => getClinicSummarySnapshot({ supabase: await createClient(), clinic: currentClinic, days }),
      generate: ({ payload, intent, followUp, model }) => generateClinicChatAnswer({ payload, intent, followUp, model,
        tenantHash: hashPublicRateLimitValue("ai:clinic", clinic.id),
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV }),
    });
    return noStoreJson(result);
  } catch (error) {
    const code = error?.name === "ZodError" ? "AI_INVALID_REQUEST"
      : ["AI_NOT_CONFIGURED", "AI_RATE_LIMITED"].includes(error?.message) ? error.message : "AI_UNAVAILABLE";
    return noStoreJson({ error: code }, { status: code === "AI_INVALID_REQUEST" ? 400 : code === "AI_RATE_LIMITED" ? 429 : 503 });
  }
}
