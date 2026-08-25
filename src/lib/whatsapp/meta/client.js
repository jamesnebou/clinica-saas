import "server-only";
import { MetaCloudError } from "./errors";

function graphVersion() {
  const value = String(process.env.META_GRAPH_API_VERSION || "").trim();
  if (!/^v\d+\.\d+$/.test(value)) throw new Error("META_GRAPH_API_VERSION não configurada ou inválida.");
  return value;
}
export function isMetaConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_GRAPH_API_VERSION && process.env.META_WHATSAPP_CONFIG_ID && process.env.META_SYSTEM_USER_ACCESS_TOKEN && process.env.META_WEBHOOK_VERIFY_TOKEN);
}
export class MetaGraphClient {
  constructor({ accessToken, fetchImpl = fetch } = {}) { this.accessToken = accessToken || process.env.META_SYSTEM_USER_ACCESS_TOKEN; this.fetchImpl = fetchImpl; }
  url(path, query = {}) {
    const url = new URL(`https://graph.facebook.com/${graphVersion()}/${String(path || "").replace(/^\/+/, "")}`);
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    return url;
  }
  async request(path, { method = "GET", query, body, accessToken, requireAuth = true } = {}) {
    const token = accessToken || this.accessToken;
    if (requireAuth && !token) throw new Error("Token server-side da Meta não configurado.");
    const response = await this.fetchImpl(this.url(path, query), { method, headers: { ...(requireAuth ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      const meta = payload?.error || {}; const transient = response.status === 429 || response.status >= 500 || meta.is_transient === true || [1,2,4,17,32,613].includes(Number(meta.code));
      throw new MetaCloudError(meta.message || `Meta Graph API retornou HTTP ${response.status}.`, { status: response.status, code: meta.code, subcode: meta.error_subcode, transient });
    }
    return payload;
  }
  exchangeEmbeddedSignupCode(code) {
    return this.request("oauth/access_token", { query: { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, code }, requireAuth: false });
  }
  getWaba(id, token) { return this.request(id, { query: { fields: "id,name,currency,timezone_id,message_template_namespace" }, accessToken: token }); }
  listPhoneNumbers(id, token) { return this.request(`${id}/phone_numbers`, { query: { fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput" }, accessToken: token }); }
  subscribeApp(id, token) { return this.request(`${id}/subscribed_apps`, { method: "POST", accessToken: token }); }
  unsubscribeApp(id) { return this.request(`${id}/subscribed_apps`, { method: "DELETE" }); }
  listSubscribedApps(id) { return this.request(`${id}/subscribed_apps`); }
  listTemplates(id, after) { return this.request(`${id}/message_templates`, { query: { fields: "id,name,language,category,status,components,rejected_reason", limit: 100, after } }); }
  createTemplate(id, payload) { return this.request(`${id}/message_templates`, { method: "POST", body: payload }); }
  getPhoneNumber(id) { return this.request(id, { query: { fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput" } }); }
  sendTemplate(id, body) { return this.request(`${id}/messages`, { method: "POST", body }); }
}
