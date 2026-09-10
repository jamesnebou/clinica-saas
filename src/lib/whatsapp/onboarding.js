import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashOpaqueToken, secureOpaqueToken } from "./core.mjs";
import { MetaGraphClient } from "./meta/client";
import { MetaCloudProvider } from "./meta/provider";
import { sanitizeMetaError } from "./meta/errors";
import { provisionMetaOnboarding } from "./meta/onboarding-core.mjs";
import { templatePurposeFromName } from "./meta/templates";
import { getMetaConnectOrigin, resolveClinicReturnOrigin } from "./broker";

const META_TEMPLATE_STATUSES = new Set(["APPROVED","PENDING","REJECTED","PAUSED","DISABLED","IN_APPEAL","PENDING_DELETION","DELETED","LIMIT_EXCEEDED"]);

export async function createEmbeddedSignupSession({ clinicId, userId, role, requestOrigin }) {
  const returnOrigin = await resolveClinicReturnOrigin({ clinicId, requestOrigin });
  const connectOrigin = getMetaConnectOrigin();
  const state = secureOpaqueToken(); const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const { data, error } = await supabaseAdmin.from("whatsapp_onboarding_sessions").insert({
    clinica_id: clinicId,
    user_id: userId,
    state_hash: hashOpaqueToken(state),
    expires_at: expiresAt,
    metadata: { stage: "started", return_origin: returnOrigin, broker_origin: connectOrigin, initiated_role: role },
  }).select("id").single();
  if (error) throw error;
  const brokerUrl = new URL("/whatsapp/connect", connectOrigin);
  brokerUrl.searchParams.set("state", state);
  return { sessionId: data.id, brokerUrl: brokerUrl.toString(), connectOrigin, expiresAt };
}

async function sessionByState(state) {
  const normalizedState = String(state || "").trim();
  if (!normalizedState) throw new Error("Sessão de conexão inválida.");
  const { data, error } = await supabaseAdmin
    .from("whatsapp_onboarding_sessions")
    .select("id,clinica_id,user_id,status,expires_at,metadata")
    .eq("state_hash", hashOpaqueToken(normalizedState))
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Sessão de conexão inválida ou expirada.");
  return data;
}

function assertBrokerEnvironment(session) {
  if (session.metadata?.broker_origin !== getMetaConnectOrigin()) {
    throw new Error("Sessão criada para outro ambiente.");
  }
}

export async function getEmbeddedSignupBrokerSession({ state }) {
  const session = await sessionByState(state);
  assertBrokerEnvironment(session);
  if (Date.parse(session.expires_at) <= Date.now() && session.status !== "completed") {
    await supabaseAdmin.from("whatsapp_onboarding_sessions").update({ status: "expired", metadata: { ...(session.metadata || {}), failed_stage: "broker_expired", stage: "failed" } }).eq("id", session.id).eq("status", session.status);
    throw new Error("Sessão de conexão expirada.");
  }
  if (!["pending", "processing", "completed"].includes(session.status)) throw new Error("Sessão de conexão indisponível.");
  const returnOrigin = normalizeStoredReturnOrigin(session.metadata?.return_origin);
  return {
    sessionId: session.id,
    status: session.status,
    returnOrigin,
    appId: process.env.META_APP_ID || "",
    configId: process.env.META_WHATSAPP_CONFIG_ID || "",
    graphVersion: process.env.META_GRAPH_API_VERSION || "",
  };
}

function normalizeStoredReturnOrigin(value) {
  const origin = String(value || "").trim();
  if (!origin || new URL(origin).origin !== origin) throw new Error("Origem de retorno da sessão inválida.");
  return origin;
}

export async function completeEmbeddedSignupFromBroker({ state, code, wabaId, phoneNumberId }) {
  const session = await sessionByState(state);
  assertBrokerEnvironment(session);
  const result = await completeEmbeddedSignup({ state, code, wabaId, phoneNumberId, clinicId: session.clinica_id, userId: session.user_id });
  return { ...result, sessionId: session.id };
}

export async function failEmbeddedSignupBrokerSession({ state, reason }) {
  const session = await sessionByState(state);
  assertBrokerEnvironment(session);
  const failedStage = ["meta_cancelled", "meta_refused", "assets_missing"].includes(reason) ? reason : "broker_failed";
  if (session.status === "completed") return { sessionId: session.id, status: "completed" };
  if (session.status === "pending") {
    const { error } = await supabaseAdmin.from("whatsapp_onboarding_sessions").update({
      status: "failed",
      last_error: "Conexão interativa não concluída.",
      metadata: { ...(session.metadata || {}), failed_stage: failedStage, stage: "failed" },
    }).eq("id", session.id).eq("status", "pending");
    if (error) throw error;
  }
  return { sessionId: session.id, status: session.status === "pending" ? "failed" : session.status };
}

export async function getEmbeddedSignupSessionStatus({ sessionId, clinicId, userId }) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_onboarding_sessions")
    .select("id,status,expires_at,metadata")
    .eq("id", sessionId)
    .eq("clinica_id", clinicId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.status === "pending" && Date.parse(data.expires_at) <= Date.now()) {
    await supabaseAdmin.from("whatsapp_onboarding_sessions").update({
      status: "expired",
      metadata: { ...(data.metadata || {}), failed_stage: "broker_expired", stage: "failed" },
    }).eq("id", data.id).eq("clinica_id", clinicId).eq("user_id", userId).eq("status", "pending");
    data.status = "expired";
    data.metadata = { ...(data.metadata || {}), failed_stage: "broker_expired", stage: "failed" };
  }
  return {
    sessionId: data.id,
    status: data.status,
    stage: data.metadata?.stage || "started",
    failedStage: data.metadata?.failed_stage || null,
    ready: data.status === "completed" && data.metadata?.stage === "ready",
    expiresAt: data.expires_at,
  };
}

async function consumeSession({ state, clinicId, userId }) {
  const now = new Date().toISOString(); const hash = hashOpaqueToken(state);
  const { data: existing, error: readError } = await supabaseAdmin.from("whatsapp_onboarding_sessions").select("id,status,expires_at,metadata").eq("state_hash", hash).eq("clinica_id", clinicId).eq("user_id", userId).maybeSingle();
  if (readError) throw readError;
  if (!existing) throw new Error("Sessão de conexão expirada ou pertencente a outra clínica.");
  if (existing.status === "completed" && existing.metadata?.connection_id) return { ...existing, replay: true };
  if (existing.status !== "pending") throw new Error("Sessão de conexão expirada ou já utilizada.");
  if (Date.parse(existing.expires_at) <= Date.now()) {
    await supabaseAdmin.from("whatsapp_onboarding_sessions").update({ status: "expired", metadata: { ...(existing.metadata || {}), stage: "failed" } }).eq("id", existing.id).eq("status", "pending");
    throw new Error("Sessão de conexão expirada ou já utilizada.");
  }
  const { data, error } = await supabaseAdmin.from("whatsapp_onboarding_sessions").update({ status: "processing", used_at: now }).eq("id", existing.id).eq("status", "pending").select("id,status,metadata").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Esta sessão já está sendo processada.");
  return data;
}

async function updateSessionStage(session, stage, metadata = {}) {
  session.metadata = { ...(session.metadata || {}), ...metadata, stage };
  const { error } = await supabaseAdmin.from("whatsapp_onboarding_sessions").update({ metadata: session.metadata }).eq("id", session.id).eq("status", "processing");
  if (error) throw error;
}

async function validateTenantOwnership(clinicId, { wabaId, phoneNumberId }) {
  const [{ data: phoneOwner, error: phoneError }, { data: wabaOwner, error: wabaError }] = await Promise.all([
    supabaseAdmin.from("whatsapp_connections").select("id,clinica_id").eq("phone_number_id", phoneNumberId).limit(1).maybeSingle(),
    supabaseAdmin.from("whatsapp_connections").select("id,clinica_id").eq("waba_id", wabaId).limit(1).maybeSingle(),
  ]);
  if (phoneError) throw phoneError;
  if (wabaError) throw wabaError;
  if ([phoneOwner, wabaOwner].some((owner) => owner && owner.clinica_id !== clinicId)) {
    throw new Error("Esta WABA ou número já está conectado a outra clínica.");
  }
}

function throwIfError(result) {
  if (result?.error) throw result.error;
  return result?.data;
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
  if (session.replay) return { connectionId: session.metadata.connection_id, sync: session.metadata.sync || null, replay: true };
  let touchedConnectionId = null;
  let previousConnection = null;
  let demotedConnectionId = null;
  try {
    const provisioned = await provisionMetaOnboarding({
      client,
      code,
      wabaId,
      phoneNumberId,
      appId: process.env.META_APP_ID,
      businessId: process.env.META_BUSINESS_ID,
      systemUserId: process.env.META_SYSTEM_USER_ID,
      permanentToken: process.env.META_SYSTEM_USER_ACCESS_TOKEN,
      registrationSecret: process.env.META_PHONE_REGISTRATION_SECRET,
      onStage: (stage, metadata) => updateSessionStage(session, stage, metadata),
      validateTenantOwnership: (assets) => validateTenantOwnership(clinicId, assets),
    });
    const { waba, phone } = provisioned;
    const connectionPayload = { clinica_id: clinicId, provider: "meta_cloud", is_primary: true, meta_business_id: process.env.META_BUSINESS_ID, waba_id: String(wabaId), phone_number_id: String(phoneNumberId), display_phone_number: phone.display_phone_number || null, verified_name: phone.verified_name || waba.name || null, connection_status: "connecting", onboarding_status: "templates_syncing", billing_mode: "client_direct", connection_mode: "cloud_only", quality_rating: phone.quality_rating || null, messaging_limit: phone?.throughput?.level || null, connected_at: null, disconnected_at: null, last_error: null, metadata: { code_verification_status: phone.code_verification_status || null, platform_type: phone.platform_type || null, system_user_verified: true, phone_registration_managed: true } };
    const [{ data: currentPrimary, error: primaryError }, { data: matchingConnection, error: matchingError }] = await Promise.all([
      supabaseAdmin.from("whatsapp_connections").select("*").eq("clinica_id", clinicId).eq("is_primary", true).maybeSingle(),
      supabaseAdmin.from("whatsapp_connections").select("*").eq("clinica_id", clinicId).eq("phone_number_id", String(phoneNumberId)).maybeSingle(),
    ]);
    if (primaryError) throw primaryError;
    if (matchingError) throw matchingError;
    if (currentPrimary?.id && matchingConnection?.id && currentPrimary.id !== matchingConnection.id) {
      const { error: demoteError } = await supabaseAdmin.from("whatsapp_connections").update({ is_primary: false }).eq("id", currentPrimary.id).eq("clinica_id", clinicId);
      if (demoteError) throw demoteError;
      demotedConnectionId = currentPrimary.id;
    }
    const targetConnectionId = matchingConnection?.id || currentPrimary?.id;
    previousConnection = targetConnectionId === matchingConnection?.id ? matchingConnection : currentPrimary;
    const connectionQuery = targetConnectionId
      ? supabaseAdmin.from("whatsapp_connections").update(connectionPayload).eq("id", targetConnectionId)
      : supabaseAdmin.from("whatsapp_connections").insert(connectionPayload);
    const { data: connection, error } = await connectionQuery.select("*").single();
    if (error) throw error;
    touchedConnectionId = connection.id;
    throwIfError(await supabaseAdmin.from("whatsapp_automation_settings").upsert({ clinica_id: clinicId, connection_id: connection.id }, { onConflict: "clinica_id" }));
    const sync = await syncConnectionTemplates(connection);
    const readyAt = new Date().toISOString();
    throwIfError(await supabaseAdmin.from("whatsapp_connections").update({ onboarding_status: "ready", connection_status: "connected", connected_at: readyAt, last_health_check_at: readyAt, last_error: null }).eq("id", connection.id).eq("clinica_id", clinicId));
    session.metadata = { ...(session.metadata || {}), stage: "ready", connection_id: connection.id, sync };
    throwIfError(await supabaseAdmin.from("whatsapp_onboarding_sessions").update({ status: "completed", metadata: session.metadata }).eq("id", session.id).eq("status", "processing"));
    await supabaseAdmin.from("auditoria_clinica").insert({ clinica_id: clinicId, actor_id: userId, acao: "whatsapp.connection.created", entidade_tipo: "whatsapp_connection", entidade_id: connection.id, metadata: { provider: "meta_cloud", billing_mode: "client_direct", system_user_assignment_created: provisioned.assignmentCreated } });
    return { connectionId: connection.id, sync };
  } catch (error) {
    const message = sanitizeMetaError(error);
    const failedStage = session.metadata?.stage || "processing";
    await supabaseAdmin.from("whatsapp_onboarding_sessions").update({ status: "failed", last_error: message, metadata: { ...(session.metadata || {}), failed_stage: failedStage, stage: "failed" } }).eq("id", session.id).eq("status", "processing");
    if (touchedConnectionId && previousConnection) {
      await supabaseAdmin.from("whatsapp_connections").update({
        is_primary: previousConnection.is_primary,
        connection_status: previousConnection.connection_status,
        onboarding_status: previousConnection.onboarding_status,
        connected_at: previousConnection.connected_at,
        disconnected_at: previousConnection.disconnected_at,
        last_error: previousConnection.last_error,
        metadata: previousConnection.metadata,
      }).eq("id", touchedConnectionId).eq("clinica_id", clinicId);
    } else if (touchedConnectionId) {
      await supabaseAdmin.from("whatsapp_connections").update({ onboarding_status: "error", connection_status: "error", last_error: message }).eq("id", touchedConnectionId).eq("clinica_id", clinicId);
    }
    if (demotedConnectionId) await supabaseAdmin.from("whatsapp_connections").update({ is_primary: true }).eq("id", demotedConnectionId).eq("clinica_id", clinicId);
    throw error;
  }
}
