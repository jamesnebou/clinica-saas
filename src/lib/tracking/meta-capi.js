import "server-only";

import { createHash } from "node:crypto";
import {
  cleanText,
  isMetaStandardEvent,
  isValidMetaEventId,
  normalizeEmail,
  normalizePhone,
  normalizePersonName,
  sanitizeMetaCustomData,
} from "./core.mjs";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function hashedArray(value, normalizer) {
  const normalized = normalizer(value);
  return normalized ? [sha256(normalized)] : undefined;
}

export function buildMetaUserData({
  email,
  phone,
  firstName,
  lastName,
  externalId,
  fbc,
  fbp,
  clientIpAddress,
  clientUserAgent,
  defaultCountryCode = process.env.META_CAPI_DEFAULT_COUNTRY_CODE || "55",
} = {}) {
  const result = {};
  const em = hashedArray(email, normalizeEmail);
  const ph = hashedArray(phone, (value) => normalizePhone(value, defaultCountryCode));
  const fn = hashedArray(firstName, normalizePersonName);
  const ln = hashedArray(lastName, normalizePersonName);
  const external = hashedArray(externalId, (value) => cleanText(value, 240));

  if (em) result.em = em;
  if (ph) result.ph = ph;
  if (fn) result.fn = fn;
  if (ln) result.ln = ln;
  if (external) result.external_id = external;

  const safeFbc = cleanText(fbc, 500);
  const safeFbp = cleanText(fbp, 500);
  const ip = cleanText(clientIpAddress, 80);
  const userAgent = cleanText(clientUserAgent, 500);
  if (safeFbc) result.fbc = safeFbc;
  if (safeFbp) result.fbp = safeFbp;
  if (ip && ip !== "unknown") result.client_ip_address = ip;
  if (userAgent) result.client_user_agent = userAgent;
  return result;
}

export function buildMetaEventPayload({
  eventName,
  eventId,
  eventTime = new Date(),
  eventSourceUrl,
  userData = {},
  customData = {},
} = {}) {
  if (!isMetaStandardEvent(eventName)) throw new Error(`Evento Meta não permitido: ${eventName || "vazio"}.`);
  if (!isValidMetaEventId(eventId)) throw new Error("event_id Meta inválido.");

  const timestamp = eventTime instanceof Date ? eventTime.getTime() : new Date(eventTime).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("event_time Meta inválido.");

  const payload = {
    event_name: eventName,
    event_time: Math.floor(timestamp / 1000),
    event_id: eventId,
    action_source: "website",
    user_data: userData,
  };

  const sourceUrl = cleanText(eventSourceUrl, 800);
  if (sourceUrl) payload.event_source_url = sourceUrl;
  const safeCustomData = sanitizeMetaCustomData(customData);
  if (Object.keys(safeCustomData).length) payload.custom_data = safeCustomData;
  return payload;
}

export function getMetaCapiConfig() {
  const datasetId = cleanText(process.env.META_CAPI_DATASET_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID, 64);
  const accessToken = cleanText(process.env.META_CAPI_ACCESS_TOKEN, 4096);
  const graphVersion = cleanText(process.env.META_CAPI_GRAPH_API_VERSION, 16) || "v26.0";
  const testEventCode = cleanText(process.env.META_CAPI_TEST_EVENT_CODE, 120);

  if (!datasetId || !accessToken) return { configured: false, reason: "META_CAPI_NOT_CONFIGURED" };
  if (!/^\d+$/.test(datasetId)) return { configured: false, reason: "META_CAPI_DATASET_INVALID" };
  if (!/^v\d+\.\d+$/.test(graphVersion)) return { configured: false, reason: "META_CAPI_VERSION_INVALID" };
  return { configured: true, datasetId, accessToken, graphVersion, testEventCode };
}

function safeGraphError(data, status) {
  const error = data?.error || {};
  return {
    code: cleanText(error.code || `HTTP_${status}`, 80) || `HTTP_${status}`,
    subcode: cleanText(error.error_subcode, 80),
    type: cleanText(error.type, 120),
    transient: Boolean(error.is_transient) || status === 429 || status >= 500,
  };
}

export async function sendMetaConversionPayload(eventPayload, { timeoutMs = 3500 } = {}) {
  const config = getMetaCapiConfig();
  if (!config.configured) return { ok: false, skipped: true, code: config.reason, transient: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, Math.min(10000, Number(timeoutMs) || 3500)));
  try {
    const endpoint = `https://graph.facebook.com/${config.graphVersion}/${config.datasetId}/events?access_token=${encodeURIComponent(config.accessToken)}`;
    const requestBody = { data: [eventPayload] };
    if (config.testEventCode) requestBody.test_event_code = config.testEventCode;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, ...safeGraphError(data, response.status), httpStatus: response.status };
    return {
      ok: true,
      eventsReceived: Number(data?.events_received || 0),
      traceId: cleanText(data?.fbtrace_id, 160),
    };
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return { ok: false, code: aborted ? "META_CAPI_TIMEOUT" : "META_CAPI_NETWORK", transient: true };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendMetaConversionEvent(input, options) {
  const payload = buildMetaEventPayload(input);
  return sendMetaConversionPayload(payload, options);
}
