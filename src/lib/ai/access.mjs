export function canUseClinicAi(context, clinic = context?.activeClinic) {
  if (!context?.user?.id || !clinic?.id || clinic.id !== context?.activeClinic?.id) return false;
  const membership = (context.memberships || []).find((item) => item.clinica_id === clinic.id && item.user_id === context.user.id && item.ativo === true);
  if (!membership || !["owner", "admin"].includes(membership.papel)
    || !["unlimited_lifetime", "internal_full_access"].includes(clinic.plan_entitlements_mode)) return false;
  if (process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV !== "production" && !process.env.VERCEL_ENV) return true;
  const allowed = (value, id) => Boolean(id && value?.split(",").map((item) => item.trim()).includes(id));
  return process.env.NEXAWI_AI_BETA_ENABLED === "true"
    && allowed(process.env.NEXAWI_AI_BETA_USER_IDS, context.user.id)
    && allowed(process.env.NEXAWI_AI_BETA_CLINIC_IDS, clinic.id);
}
