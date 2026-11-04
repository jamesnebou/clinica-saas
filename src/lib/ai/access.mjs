export function canUseClinicAi(context, clinic = context?.activeClinic) {
  if (!context?.user?.id || !clinic?.id || clinic.id !== context?.activeClinic?.id) return false;
  const membership = (context.memberships || []).find((item) => item.clinica_id === clinic.id && item.user_id === context.user.id && item.ativo === true);
  return Boolean(membership && ["owner", "admin"].includes(membership.papel)
    && ["unlimited_lifetime", "internal_full_access"].includes(clinic.plan_entitlements_mode));
}
