export const META_BROKER_MESSAGE_TYPE = "NEXAWI_WHATSAPP_ONBOARDING";

function firstHeaderValue(value) {
  return String(value || "").split(",")[0].trim();
}

export function normalizeHttpOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function requestOriginFromHeaders({ host, forwardedHost, forwardedProto, fallbackUrl } = {}) {
  const selectedHost = firstHeaderValue(forwardedHost) || firstHeaderValue(host);
  const fallback = normalizeHttpOrigin(fallbackUrl);
  if (!selectedHost) return fallback;
  const protocol = firstHeaderValue(forwardedProto) || (fallback?.startsWith("https://") ? "https" : "http");
  return normalizeHttpOrigin(`${protocol === "https" ? "https" : "http"}://${selectedHost}`);
}

export function configuredPlatformHosts({ primaryHosts, appOrigins = [], vercelEnvironment, nodeEnv } = {}) {
  const hosts = new Set(
    String(primaryHosts || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const value of appOrigins) {
    const origin = normalizeHttpOrigin(value);
    if (origin) hosts.add(new URL(origin).hostname.toLowerCase());
  }
  if (nodeEnv !== "production") {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
  }
  return { hosts, allowVercelPreview: vercelEnvironment === "preview" };
}

export function isPlatformReturnOrigin(origin, options = {}) {
  const normalized = normalizeHttpOrigin(origin);
  if (!normalized) return false;
  const url = new URL(normalized);
  const { hosts, allowVercelPreview } = configuredPlatformHosts(options);
  const hostname = url.hostname.toLowerCase();
  const configuredHost = [...hosts].some((host) => hostname === host || hostname.endsWith(`.${host}`));
  return configuredHost || (allowVercelPreview && hostname.endsWith(".vercel.app"));
}

export function isExpectedBrokerOrigin(requestOrigin, configuredOrigin) {
  const request = normalizeHttpOrigin(requestOrigin);
  const configured = normalizeHttpOrigin(configuredOrigin);
  return Boolean(request && configured && request === configured);
}

export function isTrustedBrokerMessage({ eventOrigin, expectedOrigin, eventSource, popupWindow, data, sessionId }) {
  return Boolean(
    isExpectedBrokerOrigin(eventOrigin, expectedOrigin)
      && eventSource
      && eventSource === popupWindow
      && data?.type === META_BROKER_MESSAGE_TYPE
      && String(data?.sessionId || "") === String(sessionId || ""),
  );
}

function csvValues(value) {
  return String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function isMetaConnectCanary({ clinicId, returnOrigin, clinicIds, hosts }) {
  const normalizedClinicId = String(clinicId || "").trim().toLowerCase();
  if (normalizedClinicId && csvValues(clinicIds).includes(normalizedClinicId)) return true;
  const origin = normalizeHttpOrigin(returnOrigin);
  if (!origin) return false;
  const hostname = new URL(origin).hostname.toLowerCase();
  return csvValues(hosts).includes(hostname);
}
