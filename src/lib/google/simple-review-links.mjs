const GOOGLE_HOSTS = new Set(["google.com", "google.com.br", "g.page", "maps.app.goo.gl"]);

function isGoogleReviewHost(hostname, pathname) {
  if (GOOGLE_HOSTS.has(hostname)) return true;
  if (hostname.endsWith(".google.com") || hostname.endsWith(".google.com.br")) return true;
  return hostname === "goo.gl" && pathname.startsWith("/maps/");
}

export function normalizeGoogleReviewUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.length > 2048) throw new Error("O link do Google é longo demais.");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Informe um link válido do Google começando com https://.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || !isGoogleReviewHost(url.hostname.toLowerCase(), url.pathname)
    || ["/url", "/aclk"].includes(url.pathname)) {
    throw new Error("Use um link HTTPS válido do Google Maps ou do Perfil da Empresa.");
  }
  return url.href;
}

export function simpleGoogleLinks(site) {
  const validOrNull = (value) => {
    try { return normalizeGoogleReviewUrl(value); } catch { return null; }
  };
  return {
    writeUrl: validOrNull(site?.google_review_write_url),
    viewUrl: validOrNull(site?.google_reviews_view_url),
  };
}

export function mergeSimpleGoogleLinks(site, { writeUrl, viewUrl }) {
  return {
    ...(site || {}),
    google_review_write_url: normalizeGoogleReviewUrl(writeUrl),
    google_reviews_view_url: normalizeGoogleReviewUrl(viewUrl),
  };
}
