export const COEXISTENCE_FINISH = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";

export function onboardingMode(value = "cloud_only") {
  if (!["cloud_only", "coexistence"].includes(value)) throw new Error("Modo de conexao invalido.");
  return value;
}

export function embeddedSignupOptions(configId, mode) {
  return {
    config_id: configId,
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {},
      featureType: onboardingMode(mode) === "coexistence" ? "whatsapp_business_app_onboarding" : "",
      sessionInfoVersion: "3",
    },
  };
}

export function parseSignupEvent(origin, raw, mode) {
  if (!["https://www.facebook.com", "https://web.facebook.com"].includes(origin)) return null;
  let payload;
  try { payload = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
  if (payload?.type !== "WA_EMBEDDED_SIGNUP") return null;
  if (payload.event === "CANCEL" || payload.event === "ERROR") {
    return { error: payload.event === "CANCEL" ? "Conexao cancelada na Meta." : "A Meta nao concluiu a autorizacao." };
  }
  if (!["FINISH", COEXISTENCE_FINISH].includes(payload.event)) return null;
  const expected = onboardingMode(mode) === "coexistence" ? COEXISTENCE_FINISH : "FINISH";
  if (payload.event !== expected) return { error: "A Meta concluiu um modo diferente do solicitado." };
  const wabaId = String(payload.data?.waba_id || "");
  const phoneNumberId = String(payload.data?.phone_number_id || "");
  if (!/^\d+$/.test(wabaId) || (phoneNumberId && !/^\d+$/.test(phoneNumberId)) ||
      (!phoneNumberId && expected === "FINISH")) return { error: "A Meta nao retornou todos os ativos." };
  return { wabaId, phoneNumberId, finishEvent: payload.event };
}

// OAuth code and session logging may arrive in either order. Never reuse prior assets.
export function createSignupAttempt(mode, { complete, fail }) {
  let code = null;
  let assets = null;
  let settled = false;
  function reject(message) {
    if (settled) return;
    settled = true;
    fail(message);
  }
  function finish() {
    if (settled || !code || !assets) return;
    settled = true;
    complete({ code, ...assets });
  }
  return {
    event(origin, payload) {
      if (settled) return;
      const parsed = parseSignupEvent(origin, payload, mode);
      if (!parsed) return;
      if (parsed.error) return reject(parsed.error);
      if (assets) return;
      assets = parsed;
      finish();
    },
    response(response) {
      if (settled) return;
      if (!response?.authResponse?.code) return reject("Autorizacao Meta nao concluida.");
      code = response.authResponse.code;
      finish();
    },
    cancel: reject,
    dispose() { settled = true; },
  };
}
