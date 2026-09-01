const DEFAULT_PRODUCTION_ORIGIN = "https://clinicas.nexawi.com.br";

function validHttpOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

export function resolveTrustedAppOrigin({ configured, host, protocol, nodeEnv = "production" } = {}) {
  const configuredOrigin = validHttpOrigin(configured);
  if (configuredOrigin) return configuredOrigin;

  const hostname = String(host || "").split(":")[0].toLowerCase();
  if (nodeEnv !== "production" && ["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    return validHttpOrigin(`${protocol === "https" ? "https" : "http"}://${host}`) || "http://localhost:3000";
  }

  return DEFAULT_PRODUCTION_ORIGIN;
}
