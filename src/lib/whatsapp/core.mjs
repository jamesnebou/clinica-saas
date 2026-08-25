import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PURPOSE_BY_EVENT = Object.freeze({
  "booking.created": "booking_created",
  "booking.cancelled": "booking_cancelled", "booking.rescheduled": "booking_rescheduled",
  "payment.pending": "booking_payment_pending", "payment.confirmed": "payment_confirmed",
  "payment.expiring": "payment_expiring", "payment.expired": "payment_expired",
  "appointment.reminder_24h": "appointment_reminder_24h", "appointment.reminder_3h": "appointment_reminder_3h",
});
export const AUTOMATION_FLAG_BY_PURPOSE = Object.freeze({
  booking_created: "booking_created_enabled", booking_payment_pending: "payment_pending_enabled",
  payment_confirmed: "payment_confirmed_enabled", payment_expiring: "payment_expiring_enabled",
  payment_expired: "payment_expired_enabled", appointment_reminder_24h: "reminder_24h_enabled",
  appointment_reminder_3h: "reminder_3h_enabled", booking_cancelled: "booking_cancelled_enabled",
  booking_rescheduled: "booking_rescheduled_enabled",
});
export const RETRY_DELAYS_MS = Object.freeze([60_000, 300_000, 900_000, 3_600_000]);

export function normalizeWhatsAppPhone(value, country = "55") {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `${country}${digits}`;
  return digits.length >= 12 && digits.length <= 15 ? digits : "";
}
export function maskPhone(value) { const phone = normalizeWhatsAppPhone(value); return phone ? `${phone.slice(0, 4)}*****${phone.slice(-3)}` : "-"; }
export function secureOpaqueToken(bytes = 32) { return randomBytes(bytes).toString("base64url"); }
export function deterministicInteractionToken(jobId, secret) {
  if (!jobId || !secret) throw new Error("Job e segredo são obrigatórios para gerar interação.");
  return createHmac("sha256", secret).update(`whatsapp-interaction:${jobId}`).digest("base64url");
}
export function hashOpaqueToken(value) { return createHash("sha256").update(String(value || "")).digest("hex"); }
export function safeTokenEquals(value, expected) {
  const left = Buffer.from(hashOpaqueToken(value)); const right = Buffer.from(hashOpaqueToken(expected));
  return left.length === right.length && timingSafeEqual(left, right);
}
export function nextRetryAt(attemptCount, now = Date.now()) {
  const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, Number(attemptCount || 1) - 1));
  return new Date(now + RETRY_DELAYS_MS[index]).toISOString();
}
export function webhookDeduplicationKey(parts) { return hashOpaqueToken(Object.values(parts).map((v) => String(v || "")).join("|")); }
