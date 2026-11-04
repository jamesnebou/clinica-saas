import { getUserClinics, resolveClinicPlanEntitlements } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canUseClinicAi } from "@/lib/ai/access.mjs";
import { getClinicSummarySnapshot } from "@/lib/ai/clinic-summary-data";
import { generateClinicSummary } from "@/lib/ai/summary-generation.mjs";
import { runClinicSummary } from "@/lib/ai/summary-flow.mjs";
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
  const body = await readBoundedJson(request, 256);
  if (!body.ok || Object.keys(body.value).some((key) => key !== "days")) return noStoreJson({ error: "AI_INVALID_PERIOD" }, { status: 400 });
  try {
    const result = await runClinicSummary({
      days: body.value.days,
      clinic,
      user: context.user,
      model: process.env.AI_GATEWAY_MODEL?.trim(),
      limiter: (clinicId) => consumePublicRateLimit({ scope: "ai_summary", headers: request.headers, tenantId: clinicId, target: clinicId }),
      snapshot: async (currentClinic, days) => getClinicSummarySnapshot({ supabase: await createClient(), clinic: currentClinic, days }),
      generate: (snapshot, model) => generateClinicSummary({ snapshot, model,
        tenantHash: hashPublicRateLimitValue("ai:clinic", clinic.id),
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV }),
    });
    return noStoreJson(result);
  } catch (error) {
    const code = ["AI_NOT_CONFIGURED", "AI_RATE_LIMITED", "INVALID_PERIOD"].includes(error?.message) ? error.message : "AI_UNAVAILABLE";
    const status = code === "INVALID_PERIOD" ? 400 : code === "AI_RATE_LIMITED" ? 429 : 503;
    return noStoreJson({ error: code }, { status });
  }
}
