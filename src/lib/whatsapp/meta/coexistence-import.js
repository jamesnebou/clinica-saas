import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MetaGraphClient } from "./client";

export const IMPORT_CONSENT_VERSION = "whatsapp-coexistence-import-v1";

export async function authorizeCoexistenceImport({ clinicId, userId, role, authorized, client = new MetaGraphClient() }) {
  if (!["owner", "admin"].includes(role) || !userId || !clinicId) throw new Error("Acesso negado.");
  if (authorized !== true) throw new Error("Confirme a autorizacao explicita de importacao.");
  const { data: connection, error } = await supabaseAdmin.from("whatsapp_connections").select("*")
    .eq("clinica_id", clinicId).eq("is_primary", true).maybeSingle();
  if (error) throw error;
  if (!connection || connection.connection_mode !== "coexistence" || connection.onboarding_status !== "ready" || connection.connection_status !== "connected") {
    throw new Error("A importacao exige uma conexao Coexistence pronta.");
  }
  const existing = await authorizedImport(connection);
  if (existing) return { id: existing.id, requests: existing.requests, replay: true };
  const age = Date.now() - Date.parse(connection.connected_at);
  if (!Number.isFinite(age) || age < 0 || age > 24 * 60 * 60_000) throw new Error("A janela de 24 horas da Meta para solicitar importacao expirou. Mensagens novas continuam funcionando.");
  // Unique constraint serializes concurrent authorizations before any Graph request.
  const { data: run, error: insertError } = await supabaseAdmin.from("whatsapp_coexistence_imports").insert({
    clinica_id: clinicId, connection_id: connection.id, waba_id: connection.waba_id, phone_number_id: connection.phone_number_id,
    authorized_by: userId, authorized_at: new Date().toISOString(), consent_version: IMPORT_CONSENT_VERSION,
    contacts_authorized: true, history_authorized: true, requests: {},
  }).select("*").single();
  if (insertError) {
    if (insertError.code === "23505") {
      const prior = await authorizedImport(connection);
      if (prior) return { id: prior.id, requests: prior.requests, replay: true };
    }
    throw insertError;
  }
  const requests = {};
  for (const type of ["smb_app_state_sync", "history"]) {
    requests[type] = { status: "requested", requested_at: new Date().toISOString() };
    await persistRequests(run, requests);
    try {
      const response = await client.syncBusinessAppData(connection.phone_number_id, type);
      requests[type] = { ...requests[type], status: response?.request_id ? "accepted" : "uncertain", request_id: response?.request_id || null };
    } catch {
      // Never log provider payloads. Do not retry a one-shot request of uncertain outcome.
      requests[type] = { ...requests[type], status: "uncertain" };
    }
    await persistRequests(run, requests);
  }
  return { id: run.id, requests };
}

async function persistRequests(run, requests) {
  const { error } = await supabaseAdmin.from("whatsapp_coexistence_imports").update({ requests })
    .eq("id", run.id).eq("clinica_id", run.clinica_id);
  if (error) throw error;
}

export async function authorizedImport(connection) {
  const { data, error } = await supabaseAdmin.from("whatsapp_coexistence_imports").select("*")
    .eq("connection_id", connection.id).eq("clinica_id", connection.clinica_id)
    .eq("phone_number_id", connection.phone_number_id).eq("waba_id", connection.waba_id)
    .eq("contacts_authorized", true).eq("history_authorized", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) throw error;
  return data || null;
}
