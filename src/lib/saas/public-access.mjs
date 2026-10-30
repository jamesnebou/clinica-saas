import { isFullAccessClinic } from "./plan-entitlements.mjs";

export function publicClinicAccess(clinic, now = new Date()) {
  if (!clinic) return { allowed: false, reason: "unavailable" };
  const status = String(clinic.status || "").toLowerCase();
  const subscriptionStatus = String(clinic.assinatura_status || "").toLowerCase();
  if (["bloqueada", "cancelada", "inativa"].includes(status)) {
    return { allowed: false, reason: status };
  }
  if (isFullAccessClinic(clinic) || subscriptionStatus === "isenta") {
    return { allowed: true, reason: "exempt" };
  }
  if (status === "inadimplente" || ["cancelada", "pausada", "atrasada"].includes(subscriptionStatus)) {
    return { allowed: false, reason: status === "inadimplente" ? status : subscriptionStatus };
  }
  if (status === "ativa") {
    return subscriptionStatus === "ativa"
      ? { allowed: true, reason: "paid" }
      : { allowed: false, reason: "payment_pending" };
  }
  if (status !== "trial") return { allowed: false, reason: "unavailable" };
  const expiresAt = new Date(clinic.trial_ends_at || "");
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > now.getTime()
    ? { allowed: true, reason: "trial" }
    : { allowed: false, reason: "trial_expired" };
}

export function canAcceptPublicOperation(clinic, now = new Date()) {
  return publicClinicAccess(clinic, now).allowed;
}
