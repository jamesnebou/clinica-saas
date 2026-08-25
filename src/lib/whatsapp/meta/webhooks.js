import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashOpaqueToken, normalizeWhatsAppPhone, webhookDeduplicationKey } from "../core.mjs";
import { verifyMetaWebhookSignature } from "./webhook-core.mjs";

const STATUS_FIELDS = Object.freeze({ sent: "sent_at", delivered: "delivered_at", read: "read_at", failed: "failed_at" });
const OPT_OUT_WORDS = new Set(["PARAR", "SAIR"]);

export function verifyWebhookSignature(rawBody, signature, appSecret = process.env.META_APP_SECRET) {
  return verifyMetaWebhookSignature(rawBody, signature, appSecret);
}

function statusEnvelope(entry, value, status) {
  return { field: "messages", waba: entry.id, phone: value?.metadata?.phone_number_id, id: status.id, status: status.status, timestamp: status.timestamp };
}
function messageEnvelope(entry, value, message) {
  return { field: "messages", waba: entry.id, phone: value?.metadata?.phone_number_id, id: message.id, status: "inbound", timestamp: message.timestamp };
}
function inboundContent(message) {
  const buttonId = message?.interactive?.button_reply?.id || message?.button?.payload || "";
  const text = message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || "";
  return { type: String(message?.type || "unknown").slice(0, 40), text: String(text).slice(0, 2000), buttonId: String(buttonId).slice(0, 256) };
}

async function resolveConnection(phoneNumberId, wabaId) {
  let query = supabaseAdmin.from("whatsapp_connections").select("id,clinica_id,waba_id,phone_number_id,display_phone_number").limit(1);
  query = phoneNumberId ? query.eq("phone_number_id", phoneNumberId) : query.eq("waba_id", wabaId);
  const { data, error } = await query.maybeSingle(); if (error) throw error; return data;
}
async function resolveClient(clinicId, phone) {
  if (!phone) return null;
  const { data, error } = await supabaseAdmin.from("clientes").select("id").eq("clinica_id", clinicId).eq("telefone_whatsapp", phone).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}
async function recordAnalytics(clinicId, eventName, metadata) {
  await supabaseAdmin.from("eventos_analiticos").insert({ clinica_id: clinicId, event_name: eventName, metadata }).then(({ error }) => {
    if (error && !["42P01","PGRST205"].includes(error.code)) console.error("whatsapp_webhook_analytics_failed", { clinicId, eventName, code: error.code });
  });
}

async function processStatus({ connection, entry, value, status }) {
  const key = webhookDeduplicationKey(statusEnvelope(entry, value, status));
  const minimal = { status: status.status, timestamp: status.timestamp, conversation_id: status?.conversation?.id || null, pricing: status?.pricing || null, errors: (status?.errors || []).map((item) => ({ code: item.code, title: item.title })) };
  const { data: inserted, error: insertError } = await supabaseAdmin.from("whatsapp_webhook_events").upsert({ connection_id: connection.id, clinica_id: connection.clinica_id, deduplication_key: key, object_type: "whatsapp_business_account", event_type: `status.${status.status}`, phone_number_id: value?.metadata?.phone_number_id, waba_id: entry.id, meta_message_id: status.id, payload: minimal }, { onConflict: "deduplication_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (insertError) throw insertError; if (!inserted) return;
  const field = STATUS_FIELDS[status.status]; const timestamp = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString();
  const update = { status: ["sent","delivered","read","failed"].includes(status.status) ? status.status : "submitted", pricing_category: status?.pricing?.category || null, pricing_metadata: status?.pricing || {} };
  if (field) update[field] = timestamp;
  if (status.status === "failed") { update.error_code = String(status?.errors?.[0]?.code || ""); update.error_message = String(status?.errors?.[0]?.title || "Falha reportada pela Meta").slice(0, 350); }
  await supabaseAdmin.from("whatsapp_messages").update(update).eq("meta_message_id", status.id).eq("clinica_id", connection.clinica_id);
  await Promise.all([
    supabaseAdmin.from("whatsapp_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", inserted.id),
    supabaseAdmin.from("whatsapp_connections").update({ last_webhook_at: new Date().toISOString() }).eq("id", connection.id),
    recordAnalytics(connection.clinica_id, `whatsapp_${status.status}`, { meta_message_id: status.id }),
  ]);
}

async function confirmAppointment(connection, token) {
  const tokenHash = hashOpaqueToken(token);
  const { data: interaction, error } = await supabaseAdmin.from("whatsapp_interaction_tokens").select("id,clinica_id,agendamento_id,action,expires_at,used_at").eq("token_hash", tokenHash).eq("clinica_id", connection.clinica_id).maybeSingle();
  if (error || !interaction || interaction.used_at || new Date(interaction.expires_at) <= new Date()) return false;
  if (interaction.action !== "confirm") return false;
  const now = new Date().toISOString();
  const { data: consumed, error: consumeError } = await supabaseAdmin.from("whatsapp_interaction_tokens").update({ used_at: now }).eq("id", interaction.id).is("used_at", null).select("id").maybeSingle();
  if (consumeError || !consumed) return false;
  const { data: booking, error: bookingError } = await supabaseAdmin.from("agendamentos").update({ status: "confirmado" }).eq("id", interaction.agendamento_id).eq("clinica_id", connection.clinica_id).in("status", ["agendado","confirmado"]).select("id").maybeSingle();
  if (bookingError || !booking) return false;
  await Promise.all([
    supabaseAdmin.from("auditoria_clinica").insert({ clinica_id: connection.clinica_id, acao: "booking.confirmed_via_whatsapp", entidade_tipo: "agendamento", entidade_id: booking.id, metadata: { origem: "whatsapp" } }),
    recordAnalytics(connection.clinica_id, "booking_confirmed_via_whatsapp", { agendamento_id: booking.id }),
  ]);
  return true;
}

async function processInbound({ connection, entry, value, message }) {
  const key = webhookDeduplicationKey(messageEnvelope(entry, value, message)); const content = inboundContent(message);
  const { data: inserted, error: insertError } = await supabaseAdmin.from("whatsapp_webhook_events").upsert({ connection_id: connection.id, clinica_id: connection.clinica_id, deduplication_key: key, object_type: "whatsapp_business_account", event_type: "message.inbound", phone_number_id: value?.metadata?.phone_number_id, waba_id: entry.id, meta_message_id: message.id, payload: { type: content.type, timestamp: message.timestamp } }, { onConflict: "deduplication_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (insertError) throw insertError; if (!inserted) return;
  const phone = normalizeWhatsAppPhone(message.from);
  const [client, settingsResult] = await Promise.all([
    resolveClient(connection.clinica_id, phone),
    supabaseAdmin.from("whatsapp_automation_settings").select("privacy_mode").eq("clinica_id", connection.clinica_id).maybeSingle(),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  const action = content.buttonId.startsWith("nxw:confirm:") ? "confirm" : null;
  const storedContent = settingsResult.data?.privacy_mode === "detalhado"
    ? { type: content.type, text: content.text, action }
    : { type: content.type, has_text: Boolean(content.text), action };
  await supabaseAdmin.from("whatsapp_messages").upsert({ clinica_id: connection.clinica_id, connection_id: connection.id, cliente_id: client?.id || null, direction: "inbound", message_type: content.type, sender_phone: phone, recipient_phone: connection.display_phone_number, meta_message_id: message.id, status: "received", content: storedContent, received_at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString() }, { onConflict: "meta_message_id", ignoreDuplicates: true });
  const normalizedText = content.text.trim().toLocaleUpperCase("pt-BR");
  if (OPT_OUT_WORDS.has(normalizedText) && phone) {
    await supabaseAdmin.from("communication_preferences").upsert({ clinica_id: connection.clinica_id, cliente_id: client?.id || null, phone_normalized: phone, whatsapp_transactional_opt_in: false, whatsapp_marketing_opt_in: false, opt_out_at: new Date().toISOString(), opt_in_source: "whatsapp_keyword" }, { onConflict: "clinica_id,phone_normalized" });
  }
  if (content.buttonId.startsWith("nxw:confirm:")) await confirmAppointment(connection, content.buttonId.slice("nxw:confirm:".length));
  await Promise.all([
    supabaseAdmin.from("whatsapp_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", inserted.id),
    supabaseAdmin.from("whatsapp_connections").update({ last_webhook_at: new Date().toISOString() }).eq("id", connection.id),
    recordAnalytics(connection.clinica_id, "whatsapp_inbound", { type: content.type, matched_client: Boolean(client?.id) }),
  ]);
}

export async function ingestWhatsAppWebhook(payload) {
  let processed = 0;
  for (const entry of payload?.entry || []) for (const change of entry?.changes || []) {
    if (change?.field !== "messages") continue;
    const value = change?.value || {}; const connection = await resolveConnection(value?.metadata?.phone_number_id, entry.id);
    if (!connection) continue;
    for (const status of value.statuses || []) { await processStatus({ connection, entry, value, status }); processed += 1; }
    for (const message of value.messages || []) { await processInbound({ connection, entry, value, message }); processed += 1; }
  }
  return { processed };
}
