export function getClinicAiMembership(context, clinic = context?.activeClinic) {
  if (!context?.user?.id || !clinic?.id || clinic.id !== context?.activeClinic?.id) return null;
  return (context.memberships || []).find((item) => item.clinica_id === clinic.id && item.user_id === context.user.id && item.ativo === true) || null;
}

export function canUseClinicAi(context, clinic = context?.activeClinic) {
  const membership = getClinicAiMembership(context, clinic);
  if (!membership || !["owner", "admin"].includes(membership.papel)) return false;
  if (process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV !== "production" && !process.env.VERCEL_ENV) {
    return ["unlimited_lifetime", "internal_full_access"].includes(clinic.plan_entitlements_mode);
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const allowed = (value, id) => Boolean(uuid.test(id) && value?.split(",").some((item) => item.trim() === id));
  return process.env.NEXAWI_AI_BETA_ENABLED === "true"
    && allowed(process.env.NEXAWI_AI_BETA_USER_IDS, context.user.id)
    && allowed(process.env.NEXAWI_AI_BETA_CLINIC_IDS, clinic.id);
}
