import { createHash } from "node:crypto";
import { getUserClinics, resolveClinicPlanEntitlements } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canUseClinicAi } from "@/lib/ai/access.mjs";
import { canAccessSection, getCurrentMembership, sectionHasCapability } from "@/lib/auth/permissions";
import { getClinicPlan } from "@/lib/saas/plans";
import { getClinicCapabilities } from "@/lib/segments/service";
import { noStoreJson } from "@/lib/security/public-antiabuse";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await getUserClinics();
    if (!context.user) return noStoreJson({ error: "AI_FORBIDDEN" }, { status: 401 });
    const clinic = await resolveClinicPlanEntitlements(context);
    if (!canUseClinicAi(context, clinic)) return noStoreJson({ error: "AI_FORBIDDEN" }, { status: 403 });
    const membership = getCurrentMembership(context.memberships, clinic.id);
    if (!canAccessSection(membership?.papel, "agenda", membership)) return noStoreJson({ error: "AI_FORBIDDEN" }, { status: 403 });
    const supabase = await createClient();
    const plan = await getClinicPlan(context.activeClinic);
    const capabilities = await getClinicCapabilities({ clinic: context.activeClinic, plan, client: supabase });
    if (!sectionHasCapability("agenda", capabilities.effective)) return noStoreJson({ error: "AI_FORBIDDEN" }, { status: 403 });
    const scopeKey = createHash("sha256").update("clinic-ai\0").update(context.user.id).update("\0").update(clinic.id).digest("hex");
    return noStoreJson({ scopeKey });
  } catch {
    return noStoreJson({ error: "AI_UNAVAILABLE" }, { status: 503 });
  }
}
