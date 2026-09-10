export const BROKER_TELEMETRY_EVENTS = Object.freeze([
  "broker_rendered",
  "sdk_script_loading",
  "sdk_script_loaded",
  "fb_init_completed",
  "continue_meta_clicked",
  "fb_login_invoked",
  "fb_login_returned_sync",
  "fb_login_threw",
  "document_visibility_hidden",
  "document_visibility_visible",
  "pagehide",
  "pageshow",
  "meta_message_received",
  "meta_finish",
  "meta_cancel",
  "meta_error",
  "fb_login_callback_received",
  "fb_login_callback_without_code",
  "fb_login_timeout",
]);

const BROKER_TELEMETRY_EVENT_SET = new Set(BROKER_TELEMETRY_EVENTS);
const META_MESSAGE_EVENTS = new Set(["FINISH", "CANCEL", "ERROR"]);
const META_MESSAGE_TYPE = "WA_EMBEDDED_SIGNUP";
const MAX_ERROR_NAME_LENGTH = 80;
const MAX_ERROR_MESSAGE_LENGTH = 240;

function sanitizeTelemetryErrorText(value, maxLength, fallback) {
  const sensitiveAssignment = /\b(access[_ -]?token|app[_ -]?secret|client[_ -]?secret|authorization|bearer|password|api[_ -]?key|state|code|config[_ -]?id|app[_ -]?id|waba(?:[_ -]?id)?|phone(?:[_ -]?number)?[_ -]?id)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
  const sanitized = String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(sensitiveAssignment, "$1=[redacted]")
    .replace(/\b(?:https?|wss?):\/\/[^\s]+/gi, "[url]")
    .replace(/\?[^\s]+/g, "?[redacted]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\b\d{8,}\b/g, "[id]")
    .replace(/\b(?=[A-Za-z0-9_-]{20,}\b)(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/g, "[redacted]")
    .trim();
  return (sanitized || fallback).slice(0, maxLength);
}

export function sanitizeBrokerTelemetryError(error) {
  const rawMessage = error && typeof error === "object" ? error.message : error;
  return {
    error_name: sanitizeTelemetryErrorText(error?.name, MAX_ERROR_NAME_LENGTH, "Error"),
    error_message: sanitizeTelemetryErrorText(rawMessage, MAX_ERROR_MESSAGE_LENGTH, "Falha síncrona sem detalhes."),
  };
}

function isFacebookHostname(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "facebook.com" || normalized.endsWith(".facebook.com");
}

export function isTrustedMetaMessageOrigin(origin) {
  try {
    const url = new URL(String(origin || ""));
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && isFacebookHostname(url.hostname);
  } catch {
    return false;
  }
}

export function metaMessageOriginHostname(origin) {
  if (!isTrustedMetaMessageOrigin(origin)) return null;
  return new URL(origin).hostname.toLowerCase();
}

export function buildEmbeddedSignupV4LoginOptions(configId) {
  const normalizedConfigId = String(configId || "").trim();
  if (!normalizedConfigId) throw new Error("Configuração do Embedded Signup ausente.");
  return {
    config_id: normalizedConfigId,
    auth_type: "rerequest",
    response_type: "code",
    override_default_response_type: true,
    extras: { setup: {} },
  };
}

export function normalizeBrokerTelemetryPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const event = String(payload.event || "").trim();
  const state = String(payload.state || "").trim();
  if (!state || state.length > 128 || !BROKER_TELEMETRY_EVENT_SET.has(event)) return null;

  const baseKeys = new Set(["state", "event"]);
  if (event === "fb_login_returned_sync" || event === "fb_login_threw") {
    const allowedKeys = new Set([
      ...baseKeys,
      "user_activation_before",
      ...(event === "fb_login_threw" ? ["error_name", "error_message"] : []),
    ]);
    if (Object.keys(payload).some((key) => !allowedKeys.has(key))) return null;
    if (payload.user_activation_before !== null && typeof payload.user_activation_before !== "boolean") return null;
    if (event === "fb_login_threw" && (typeof payload.error_name !== "string" || typeof payload.error_message !== "string")) return null;

    const log = {
      event,
      user_activation_before: payload.user_activation_before,
    };
    if (event === "fb_login_threw") {
      Object.assign(log, sanitizeBrokerTelemetryError({
        name: payload.error_name,
        message: payload.error_message,
      }));
    }
    return { state, log };
  }

  if (event !== "meta_message_received") {
    if (Object.keys(payload).some((key) => !baseKeys.has(key))) return null;
    return { state, log: { event } };
  }

  const allowedKeys = new Set([...baseKeys, "meta_hostname", "meta_type", "meta_event"]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) return null;
  const metaHostname = String(payload.meta_hostname || "").trim().toLowerCase();
  const metaType = String(payload.meta_type || "").trim();
  const metaEvent = String(payload.meta_event || "").trim();
  if (!isFacebookHostname(metaHostname) || metaType !== META_MESSAGE_TYPE || !META_MESSAGE_EVENTS.has(metaEvent)) return null;
  return {
    state,
    log: {
      event,
      meta_hostname: metaHostname,
      meta_type: metaType,
      meta_event: metaEvent,
    },
  };
}
