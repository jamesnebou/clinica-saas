export const PUBLIC_RATE_LIMIT_MESSAGE = "Muitas tentativas. Aguarde alguns instantes e tente novamente.";

export const PUBLIC_RATE_LIMIT_POLICIES = Object.freeze({
  availability: Object.freeze({ limit: 60, windowSeconds: 60, failMode: "open" }),
  analytics: Object.freeze({ limit: 120, windowSeconds: 60, failMode: "closed" }),
  marketing_events: Object.freeze({ limit: 120, windowSeconds: 60, failMode: "closed" }),
  marketing_leads: Object.freeze({ limit: 3, windowSeconds: 120, targetLimit: 3, failMode: "closed" }),
  cart_read: Object.freeze({ limit: 60, windowSeconds: 300, failMode: "closed" }),
  cart_write: Object.freeze({ limit: 120, windowSeconds: 600, failMode: "closed" }),
  booking_create: Object.freeze({ limit: 6, windowSeconds: 600, targetLimit: 3, failMode: "closed" }),
  clinic_lead_create: Object.freeze({ limit: 6, windowSeconds: 600, targetLimit: 3, failMode: "closed" }),
  store_order_create: Object.freeze({ limit: 5, windowSeconds: 600, targetLimit: 3, failMode: "closed" }),
  signup: Object.freeze({ limit: 5, windowSeconds: 600, targetLimit: 3, failMode: "closed" }),
  password_recovery: Object.freeze({ limit: 5, windowSeconds: 900, targetLimit: 3, failMode: "closed" }),
  login: Object.freeze({ limit: 10, windowSeconds: 600, targetLimit: 5, failMode: "closed" }),
  demo_access: Object.freeze({ limit: 6, windowSeconds: 600, failMode: "closed" }),
  public_read: Object.freeze({ limit: 180, windowSeconds: 60, failMode: "open" }),
  order_read: Object.freeze({ limit: 60, windowSeconds: 300, failMode: "closed" }),
  auth_exchange: Object.freeze({ limit: 15, windowSeconds: 600, failMode: "closed" }),
  public_form_ingress: Object.freeze({ limit: 60, windowSeconds: 600, failMode: "closed" }),
  webhook_verify: Object.freeze({ limit: 120, windowSeconds: 60, failMode: "closed" }),
  webhook_auth: Object.freeze({ limit: 240, windowSeconds: 60, failMode: "closed" }),
});

export function publicRateLimitPolicy(scope) {
  const policy = PUBLIC_RATE_LIMIT_POLICIES[String(scope || "")];
  if (!policy) throw new Error("Unknown public rate-limit scope.");
  return policy;
}

export function publicRateLimitResponseDescriptor(result) {
  const status = result?.limited ? 429 : 503;
  return {
    body: { ok: false, error: PUBLIC_RATE_LIMIT_MESSAGE },
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429 ? { "Retry-After": String(Math.max(1, Number(result?.retryAfter || 1))) } : {}),
    },
  };
}

export function isValidPublicSlug(value) {
  return /^[a-z0-9][a-z0-9-]{0,79}$/i.test(String(value || "").trim());
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

export function looksLikeAutomatedForm(formData, { minimumMilliseconds = 800, now = Date.now() } = {}) {
  const field = (key) => typeof formData?.get === "function" ? formData.get(key) : formData?.[key];
  if (String(field("website") || "").trim()) return true;
  const startedAt = Number(field("form_started_at"));
  if (!Number.isFinite(startedAt) || startedAt <= 0) return false;
  const elapsed = now - startedAt;
  return elapsed < minimumMilliseconds;
}

export async function readBoundedJson(request, maxBytes) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, status: 413, error: "Payload muito grande." };
  }

  let raw;
  try {
    const reader = request.body?.getReader();
    if (!reader) return { ok: false, status: 400, error: "Payload inválido." };
    const chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413, error: "Payload muito grande." };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    raw = new TextDecoder().decode(bytes);
  } catch {
    return { ok: false, status: 400, error: "Payload inválido." };
  }
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, status: 413, error: "Payload muito grande." };
  }

  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_shape");
    if (["clinica_id", "tenant_id", "cliente_id"].some((key) => Object.hasOwn(value, key))) throw new Error("invalid_tenant");
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400, error: "Payload inválido." };
  }
}

// Analytics is descriptive, never a container for arbitrary form values or URLs.
export function safeAnalyticsText(value, max = 120) {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, max);
  if (/@|\b\d[\d .()+-]{7,}\d\b|[?&#=]|\b(?:bearer|token|secret|password)\b/i.test(text)) return null;
  return text || null;
}

export function safeAnalyticsPath(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, "https://public.invalid");
    if (!["https:", "http:"].includes(url.protocol)) return null;
    const path = decodeURIComponent(url.pathname);
    if (/@|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b|\b\d{8,}\b/i.test(path)
      || /\/(pedido|payment|auth)\//i.test(path)) return null;
    return path.slice(0, 300);
  } catch { return null; }
}

export function safeMarketingMetadata(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  for (const key of ["segment", "page_type", "content_name", "content_category", "location", "plan", "module", "method", "label", "variant"]) {
    const value = safeAnalyticsText(input[key], 120);
    if (value) output[key] = value;
  }
  for (const key of ["ticket", "empty_slots_week", "recovery_percent", "estimated_recovery"]) {
    if (typeof input[key] === "number" && Number.isFinite(input[key]) && Math.abs(input[key]) <= 1e9) output[key] = input[key];
  }
  return output;
}

export function safePublicOriginMetadata(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  for (const key of ["source", "medium", "campaign", "content", "term", "page"]) {
    const value = key === "page" ? safeAnalyticsPath(input[key]) : safeAnalyticsText(input[key]);
    if (value) output[key] = value;
  }
  return output;
}

export function validPublicForm(formData) {
  let size = 0;
  let count = 0;
  const seen = new Map();
  const limits = { items_json: 30000, marketing_attribution: 16000, mensagem: 1200,
    nome: 160, name: 120, telefone: 40, phone: 40, email: 320,
    password: 256, password_confirm: 256, slug: 80, cpf: 30 };
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    if (++count > 100 || typeof value !== "string" || key.length > 80) return false;
    if (["clinica_id", "tenant_id", "cliente_id"].includes(key)) return false;
    seen.set(key, (seen.get(key) || 0) + 1);
    if (seen.get(key) > (key === "procedimento_ids" ? 50 : 1)) return false;
    if (value.length > (limits[key] || 1000)) return false;
    size += new TextEncoder().encode(key + value).length;
    if (size > 48000) return false;
  }
  return true;
}
