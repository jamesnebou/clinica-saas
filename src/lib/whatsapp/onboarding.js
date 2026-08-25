import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashOpaqueToken, secureOpaqueToken } from "./core.mjs";
import { MetaGraphClient } from "./meta/client";
import { MetaCloudProvider } from "./meta/provider";
import { sanitizeMetaError } from "./meta/errors";
import { templatePurposeFromName } from "./meta/templates";

const META_TEMPLATE_STATUSES = new Set(["APPROVED","PENDING","REJECTED","PAUSED","DISABLED","IN_APPEAL","PENDING_DELETION","DELETED","LIMIT_EXCEEDED"]);

export async function createEmbeddedSignupSession({ clinicId, userId }) {
  const state = secureOpaqueToken(); const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const { error } = await supabaseAdmin.from("whatsapp_onboarding_sessions").insert({ clinica_id: clinicId, user_id: userId, state_hash: hashOpaqueToken(state), expires_at: expiresAt });
  if (error) throw error;
  return { state, expiresAt, appId: process.env.META_APP_ID || "", configId: process.env.META_WHATSAPP_CONFIG_ID || "" };
}

async function consumeSession({ state, clinicId, userId }) {
  const now = new Date().toISOString(); const hash = hashOpaqueToken(state);
  const { data, error } = await supabaseAdmin.from("whatsapp_onboarding_sessions").update({ status: "processing", used_at: now }).eq("state_hash", hash).eq("clinica_id", clinicId).eq("user_id", userId).eq("status", "pending").gt("expires_at", now).select("id").maybeSingle();
  if (error) throw error; if (!data) throw new Error("Sessão de conexão expirada ou já utilizada."); return data;
}

export async function syncConnectionTemplates(connection, provider = new MetaCloudProvider()) {
  const remote = await provider.syncTemplates(connection); const syncedAt = new Date().toISOString();
  const rows = remote.map((item) => ({ clinica_id: connection.clinica_id, connection_id: connection.id, waba_id: connection.waba_id, meta_template_id: item.id || null, name: item.name, language: item.language || "pt_BR", category: item.category || null, status: META_TEMPLATE_STATUSES.has(item.status) ? item.status : "PENDING", components: item.components || [], purpose: templatePurposeFromName(item.name) || "booking_created", rejection_reason: item.rejected_reason || null, last_synced_at: syncedAt }));
  for (const row of rows) {
    if (!templatePurposeFromName(row.name)) continue;
    const { error } = await supabaseAdmin.from("whatsapp_templates").upsert(row, { onConflict: "connection_id,name,language" }); if (error) throw error;
  }
  return { total: rows.filter((row) => templatePurposeFromName(row.name)).length, remoteTotal: remote.length };
}

export async function completeEmbeddedSignup({ state, code, wabaId, phoneNumberId, clinicId, userId, client = new MetaGraphClient() }) {
  const session = await consumeSession({ state, clinicId, userId });
  try {
    if (!/^\d+$/.test(String(wabaId)) || !/^\d+$/.test(String(phoneNumberId)) || !code) throw new Error("Ativos retornados pela Meta são inválidos.");
    const exchange = await client.exchangeEmbeddedSignupCode(code); const temporaryToken = exchange?.access_token;
    if (!temporaryToken) throw new Error("A Meta não retornou autorização utilizável.");
    const [waba, phones] = await Promise.all([client.getWaba(wabaId, temporaryToken), client.listPhoneNumbers(wabaId, temporaryToken)]);
    const phone = (phones?.data || []).find((item) => String(item.id) === String(phoneNumberId));
    if (String(waba?.id) !== String(wabaId) || !phone) throw new Error("WABA ou número não pertencem à autorização recebida.");
    await client.subscribeApp(wabaId, temporaryToken);
    const connectionPayload = { clinica_id: clinicId, provider: "meta_cloud", is_primary: true, meta_business_id: process.env.META_BUSINESS_ID || null, waba_id: String(wabaId), phone_number_id: String(phoneNumberId), display_phone_number: phone.display_phone_number || null, verified_name: phone.verified_name || waba.name || null, connection_status: "connected", onboarding_status: "webhook_subscribed", billing_mode: "client_direct", connection_mode: "cloud_only", quality_rating: phone.quality_rating || null, messaging_limit: phone?.throughput?.level || null, connected_at: new Date().toISOString(), disconnected_at: null, last_error: null, metadata: { code_verification_status: phone.code_verification_status || null, platform_type: phone.platform_type || null } };
    const [{ data: currentPrimary, error: primaryError }, { data: matchingConnection, error: matchingError }] = await Promise.all([
      supabaseAdmin.from("whatsapp_connections").select("id").eq("clinica_id", clinicId).eq("is_primary", true).maybeSingle(),
      supabaseAdmin.from("whatsapp_connections").select("id").eq("clinica_id", clinicId).eq("phone_number_id", String(phoneNumberId)).maybeSingle(),
    ]);
    if (primaryError) throw primaryError;
    if (matchingError) throw matchingError;
    if (currentPrimary?.id && matchingConnection?.id && currentPrimary.id !== matchingConnection.id) {
      const { error: demoteError } = await supabaseAdmin.from("whatsapp_connections").update({ is_primary: false }).eq("id", currentPrimary.id).eq("clinica_id", clinicId);
      if (demoteError) throw demoteError;
    }
    const targetConnectionId = matchingConnection?.id || currentPrimary?.id;
    const connectionQuery = targetConnectionId
      ? supabaseAdmin.from("whatsapp_connections").update(connectionPayload).eq("id", targetConnectionId)
      : supabaseAdmin.from("whatsapp_connections").insert(connectionPayload);
    const { data: connection, error } = await connectionQuery.select("*").single();
    if (error) throw error;
    await supabaseAdmin.from("whatsapp_automation_settings").upsert({ clinica_id: clinicId, connection_id: connection.id }, { onConflict: "clinica_id" });
    await supabaseAdmin.from("whatsapp_connections").update({ onboarding_status: "templates_syncing" }).eq("id", connection.id);
    const sync = await syncConnectionTemplates(connection);
    await Promise.all([
      supabaseAdmin.from("whatsapp_connections").update({ onboarding_status: "ready", connection_status: "connected", last_health_check_at: new Date().toISOString() }).eq("id", connection.id),
      supabaseAdmin.from("whatsapp_onboarding_sessions").update({ status: "completed", metadata: { connection_id: connection.id } }).eq("id", session.id),
      supabaseAdmin.from("auditoria_clinica").insert({ clinica_id: clinicId, actor_id: userId, acao: "whatsapp.connection.created", entidade_tipo: "whatsapp_connection", entidade_id: connection.id, metadata: { provider: "meta_cloud", billing_mode: "client_direct" } }),
    ]);
    return { connectionId: connection.id, sync };
  } catch (error) {
    const message = sanitizeMetaError(error);
    await Promise.all([
      supabaseAdmin.from("whatsapp_onboarding_sessions").update({ status: "failed", last_error: message }).eq("id", session.id),
      supabaseAdmin.from("whatsapp_connections").update({ onboarding_status: "error", connection_status: "error", last_error: message }).eq("clinica_id", clinicId).eq("is_primary", true),
    ]);
    throw error;
  }
}
