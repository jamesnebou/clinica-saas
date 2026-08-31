export const META_STANDARD_EVENTS = Object.freeze([
  "ViewContent",
  "Lead",
  "Schedule",
  "CompleteRegistration",
  "Subscribe",
  "Purchase",
]);

const META_STANDARD_EVENT_SET = new Set(META_STANDARD_EVENTS);
export const UTM_KEYS = Object.freeze(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]);

const TOUCH_KEYS = Object.freeze([
  ...UTM_KEYS,
  "fbclid",
  "fbc",
  "fbp",
  "landing_page",
  "referrer",
  "captured_at",
  "segment",
  "page_type",
]);

export function cleanText(value, max = 240) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim().slice(0, max);
  return result || null;
}

export function normalizeEmail(value) {
  return cleanText(value, 320)?.toLowerCase() || null;
}

export function normalizePhone(value, defaultCountryCode = "55") {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;

  // Aquisição atual é Brasil. Telefones já enviados em E.164 não são alterados.
  const countryCode = String(defaultCountryCode || "").replace(/\D/g, "");
  if (countryCode && (digits.length === 10 || digits.length === 11)) {
    digits = `${countryCode}${digits}`;
  }

  return digits.slice(0, 15) || null;
}

export function marketingPhoneCandidates(value, defaultCountryCode = "55") {
  const raw = String(value || "").replace(/\D/g, "").slice(0, 15) || null;
  const normalized = normalizePhone(raw, defaultCountryCode);
  const countryCode = String(defaultCountryCode || "").replace(/\D/g, "");

  const candidates = [raw, normalized];
  if (countryCode && normalized?.startsWith(countryCode)) {
    const national = normalized.slice(countryCode.length);
    if (national.length === 10 || national.length === 11) candidates.push(national);
  }

  return [...new Set(candidates.filter(Boolean))];
}

export function normalizePersonName(value) {
  const text = cleanText(value, 120)?.toLocaleLowerCase("pt-BR") || null;
  if (!text) return null;
  return text.replace(/[^\p{L}\p{N}]+/gu, "");
}

export function splitPersonName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function isMetaStandardEvent(value) {
  return META_STANDARD_EVENT_SET.has(String(value || ""));
}

export function isValidMetaEventId(value) {
  const text = cleanText(value, 160);
  return Boolean(text && /^[A-Za-z0-9._:-]+$/.test(text));
}

export function deterministicMetaEventId(prefix, id) {
  const safePrefix = String(prefix || "event").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 32) || "event";
  const safeId = String(id || "").replace(/[^A-Za-z0-9._:-]+/g, "_").slice(0, 120);
  if (!safeId) throw new Error("ID de origem obrigatório para event_id determinístico.");
  return `${safePrefix}:${safeId}`;
}

export function normalizeTouch(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  for (const key of TOUCH_KEYS) {
    const max = key === "landing_page" || key === "referrer" ? 500 : key === "fbclid" || key === "fbc" || key === "fbp" ? 500 : 160;
    const value = cleanText(input[key], max);
    if (value) output[key] = value;
  }
  return output;
}

export function hasPaidAttributionSignal(touch = {}) {
  return Boolean(touch.utm_source || touch.utm_medium || touch.utm_campaign || touch.fbclid || touch.fbc);
}

export function normalizeMarketingAttribution(input = {}) {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const firstTouch = normalizeTouch(raw.first_touch || raw.firstTouch || {});
  const lastTouch = normalizeTouch(raw.last_touch || raw.lastTouch || {});

  const fallbackTouch = normalizeTouch({
    ...Object.fromEntries(UTM_KEYS.map((key) => [key, raw[key]])),
    fbclid: raw.fbclid,
    fbc: raw.fbc,
    fbp: raw.fbp,
    landing_page: raw.first_page || raw.landing_page || raw.page,
    referrer: raw.first_referrer || raw.referrer,
    captured_at: raw.captured_at,
    segment: raw.segment,
    page_type: raw.page_type,
  });

  const effectiveFirst = Object.keys(firstTouch).length ? firstTouch : fallbackTouch;
  const effectiveLast = Object.keys(lastTouch).length ? lastTouch : fallbackTouch;
  const source = Object.keys(effectiveLast).length ? effectiveLast : effectiveFirst;

  const output = {
    attribution_version: 2,
    first_touch: effectiveFirst,
    last_touch: effectiveLast,
  };

  for (const key of UTM_KEYS) {
    const value = cleanText(source[key] || raw[key] || effectiveFirst[key], 160);
    if (value) output[key] = value;
  }

  for (const key of ["fbclid", "fbc", "fbp", "segment", "page_type"]) {
    const value = cleanText(source[key] || raw[key] || effectiveFirst[key], key.startsWith("fb") ? 500 : 160);
    if (value) output[key] = value;
  }

  const firstPage = cleanText(raw.first_page || effectiveFirst.landing_page, 500);
  const firstReferrer = cleanText(raw.first_referrer || effectiveFirst.referrer, 500);
  if (firstPage) output.first_page = firstPage;
  if (firstReferrer) output.first_referrer = firstReferrer;

  return output;
}

export function buildFbc({ fbc, fbclid, capturedAt } = {}) {
  const existing = cleanText(fbc, 500);
  if (existing) return existing;
  const clickId = cleanText(fbclid, 500);
  if (!clickId) return null;
  const timestamp = capturedAt ? Date.parse(capturedAt) : Date.now();
  const safeTimestamp = Number.isFinite(timestamp) ? Math.floor(timestamp) : Date.now();
  return `fb.1.${safeTimestamp}.${clickId}`;
}

export function sanitizeMetaCustomData(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  const allowedText = [
    "segment",
    "page_type",
    "content_name",
    "content_category",
    "plan",
    "subscription_id",
    "lead_source",
  ];
  for (const key of allowedText) {
    const value = cleanText(input[key], key === "content_name" ? 240 : 120);
    if (value) output[key] = value;
  }

  const value = Number(input.value);
  if (Number.isFinite(value) && value >= 0) output.value = Math.round(value * 100) / 100;
  const currency = cleanText(input.currency, 3)?.toUpperCase();
  if (currency && /^[A-Z]{3}$/.test(currency)) output.currency = currency;
  return output;
}

export function sanitizeInternalMetadata(input = {}, maxKeys = 24) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  for (const [key, rawValue] of Object.entries(input).slice(0, maxKeys)) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) continue;
    if (["cpf", "documento", "diagnostico", "prontuario", "anamnese", "health", "medical"].includes(key.toLowerCase())) continue;
    if (["string", "number", "boolean"].includes(typeof rawValue)) {
      output[key] = typeof rawValue === "string" ? rawValue.slice(0, 300) : rawValue;
    }
  }
  return output;
}

export function metaRetryDelayMinutes(attempt) {
  const safeAttempt = Math.max(1, Math.floor(Number(attempt) || 1));
  return Math.min(60, 2 ** Math.max(0, safeAttempt - 1));
}

export function safePagePath(value) {
  const text = cleanText(value, 500);
  if (!text || !text.startsWith("/") || text.startsWith("//")) return "/";
  return text;
}
