export const BROKER_TELEMETRY_EVENTS = Object.freeze([
  "broker_rendered",
  "sdk_script_loading",
  "sdk_script_loaded",
  "fb_init_completed",
  "continue_meta_clicked",
  "fb_login_invoked",
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
