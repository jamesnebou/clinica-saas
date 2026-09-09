import { createHash } from "node:crypto";
import { cleanText, normalizeEmail, normalizePersonName, normalizePhone } from "./core.mjs";

export const GOOGLE_LIFECYCLE_EVENTS = Object.freeze(["CompleteRegistration", "Subscribe", "Purchase", "MQL"]);

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function buildGoogleEnhancedUserData({ email, phone, firstName, lastName } = {}) {
  const output = {};
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const normalizedFirst = normalizePersonName(firstName);
  const normalizedLast = normalizePersonName(lastName);
  if (normalizedEmail) output.email_sha256 = sha256(normalizedEmail);
  if (normalizedPhone) output.phone_sha256 = sha256(normalizedPhone);
  if (normalizedFirst) output.first_name_sha256 = sha256(normalizedFirst);
  if (normalizedLast) output.last_name_sha256 = sha256(normalizedLast);
  return output;
}

export function buildGoogleOfflineConversion({ eventName, eventId, eventTime = new Date(), attribution = {}, value, currency, userData = {} } = {}) {
  if (!GOOGLE_LIFECYCLE_EVENTS.includes(eventName)) throw new Error("Evento Google offline não permitido.");
  const safeEventId = cleanText(eventId, 160);
  if (!safeEventId) throw new Error("event_id Google obrigatório.");
  const timestamp = eventTime instanceof Date ? eventTime : new Date(eventTime);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("event_time Google inválido.");
  const clickTouch = Object.keys(attribution.last_touch || {}).length
    ? attribution.last_touch
    : Object.keys(attribution.first_touch || {}).length
      ? attribution.first_touch
      : attribution;
  const output = {
    event_name: eventName,
    event_id: safeEventId,
    event_time: timestamp.toISOString(),
    gclid: cleanText(clickTouch.gclid, 500),
    gbraid: cleanText(clickTouch.gbraid, 500),
    wbraid: cleanText(clickTouch.wbraid, 500),
    user_data: userData,
  };
  const amount = Number(value);
  if (Number.isFinite(amount) && amount >= 0) output.value = Math.round(amount * 100) / 100;
  if (currency) output.currency = cleanText(currency, 3)?.toUpperCase();
  return output;
}
