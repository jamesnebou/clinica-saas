const META_MESSAGE_ORIGINS = new Set(["https://www.facebook.com", "https://web.facebook.com"]);

function parseMetaMessage(event) {
  if (!META_MESSAGE_ORIGINS.has(event.origin)) return null;
  try { return typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return null; }
}

async function loadFacebookSdk({ appId, graphVersion }) {
  if (window.FB) return;
  await new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: graphVersion });
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

export async function runLegacyEmbeddedSignup({ appId, configId, graphVersion }) {
  const assets = {};
  const listener = (event) => {
    const data = parseMetaMessage(event);
    if (data?.type !== "WA_EMBEDDED_SIGNUP" || data.event !== "FINISH") return;
    assets.wabaId = data?.data?.waba_id;
    assets.phoneNumberId = data?.data?.phone_number_id;
  };
  window.addEventListener("message", listener);
  try {
    await loadFacebookSdk({ appId, graphVersion });
    const response = await new Promise((resolve) => window.FB.login(resolve, {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
    }));
    const code = response?.authResponse?.code;
    if (!code || !assets.wabaId || !assets.phoneNumberId) {
      throw new Error("A Meta não retornou todos os ativos. Conclua todas as etapas da janela oficial.");
    }
    return { code, wabaId: assets.wabaId, phoneNumberId: assets.phoneNumberId };
  } finally {
    window.removeEventListener("message", listener);
  }
}
