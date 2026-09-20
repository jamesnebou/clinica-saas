import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashOpaqueToken, normalizeWhatsAppPhone, webhookDeduplicationKey } from "../core.mjs";
import { verifyMetaWebhookSignature } from "./webhook-core.mjs";
import { insertMetaMessage, appEchoContent } from "./message-storage.mjs";
import { authorizedImport } from "./coexistence-import";
import { importHistory, importContacts } from "./coexistence-history";

const STATUS_FIELDS = Object.freeze({ sent: "sent_at", delivered: "delivered_at", read: "read_at", failed: "failed_at" });
const OPT_OUT_WORDS = new Set(["PARAR", "SAIR"]);

export function verifyWebhookSignature(rawBody, signature, appSecret = process.env.META_APP_SECRET) {
  return verifyMetaWebhookSignature(rawBody, signature, appSecret);
}

function statusEnvelope(entry, value, status) {
  return { field: "messages", waba: entry.id, phone: value?.metadata?.phone_number_id, id: status.id, status: status.status, timestamp: status.timestamp };
}
function messageEnvelope(entry, value, message) {
  return { field: "messages", waba: entry.id, phone: value?.metadata?.phone_number_id, id: message.id, status: "inbound" };
}
function inboundContent(message) {
  const buttonId = message?.interactive?.button_reply?.id || message?.button?.payload || "";
  const text = message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || "";
  return { type: String(message?.type || "unknown").slice(0, 40), text: String(text).slice(0, 2000), buttonId: String(buttonId).slice(0, 256) };
}

async function resolveConnection(phoneNumberId, wabaId) {
  if (!phoneNumberId || !wabaId) return null;
  const query = supabaseAdmin.from("whatsapp_connections").select("id,clinica_id,waba_id,phone_number_id,display_phone_number,connection_mode")
    .eq("phone_number_id", phoneNumberId).eq("waba_id", wabaId);
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
  if (!message?.id || !message?.from) throw new Error("Mensagem inbound incompleta.");
  const key = webhookDeduplicationKey(messageEnvelope(entry, value, message)); const content = inboundContent(message);
  const { data: inserted, error: insertError } = await supabaseAdmin.from("whatsapp_webhook_events").upsert({ connection_id: connection.id, clinica_id: connection.clinica_id, deduplication_key: key, object_type: "whatsapp_business_account", event_type: "message.inbound", phone_number_id: value?.metadata?.phone_number_id, waba_id: entry.id, meta_message_id: message.id, payload: { type: content.type, timestamp: message.timestamp } }, { onConflict: "deduplication_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (insertError) throw insertError;
  const event = inserted || await retryableWebhookEvent(key, connection);
  if (!event) return;
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
  const stored = await insertMetaMessage(supabaseAdmin, { clinica_id: connection.clinica_id, connection_id: connection.id, cliente_id: client?.id || null, direction: "inbound", message_type: content.type, sender_phone: phone, recipient_phone: connection.display_phone_number, meta_message_id: message.id, status: "received", content: storedContent, received_at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString() });
  const normalizedText = content.text.trim().toLocaleUpperCase("pt-BR");
  if (!stored.inserted && stored.trigger === "business_app_history") {
    const result = await supabaseAdmin.from("whatsapp_webhook_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("id", event.id).eq("clinica_id", connection.clinica_id);
    if (result.error) throw result.error;
    return;
  }
  if (OPT_OUT_WORDS.has(normalizedText) && phone) {
    await supabaseAdmin.from("communication_preferences").upsert({ clinica_id: connection.clinica_id, cliente_id: client?.id || null, phone_normalized: phone, whatsapp_transactional_opt_in: false, whatsapp_marketing_opt_in: false, opt_out_at: new Date().toISOString(), opt_in_source: "whatsapp_keyword" }, { onConflict: "clinica_id,phone_normalized" });
  }
  if (content.buttonId.startsWith("nxw:confirm:")) await confirmAppointment(connection, content.buttonId.slice("nxw:confirm:".length));
  await Promise.all([
    supabaseAdmin.from("whatsapp_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", event.id),
    supabaseAdmin.from("whatsapp_connections").update({ last_webhook_at: new Date().toISOString() }).eq("id", connection.id),
    stored.inserted ? recordAnalytics(connection.clinica_id, "whatsapp_inbound", { type: content.type, matched_client: Boolean(client?.id) }) : Promise.resolve(),
  ]);
}

async function retryableWebhookEvent(key, connection) {
  const { data, error } = await supabaseAdmin.from("whatsapp_webhook_events").select("id,status")
    .eq("deduplication_key", key).eq("clinica_id", connection.clinica_id).eq("connection_id", connection.id).maybeSingle();
  if (error) throw error;
  return data && !["processed", "ignored"].includes(data.status) ? data : null;
}

async function processAppEcho({ connection, entry, value, message }) {
  if (!message?.id || !message?.to || !message?.from) throw new Error("Echo Meta incompleto.");
  const sender = normalizeWhatsAppPhone(message.from);
  if (!sender || sender !== normalizeWhatsAppPhone(connection.display_phone_number)) throw new Error("Origem do echo incompativel.");
  const key = webhookDeduplicationKey({ field: "smb_message_echoes", waba: entry.id, phone: connection.phone_number_id, id: message.id });
  const { data: inserted, error } = await supabaseAdmin.from("whatsapp_webhook_events").upsert({
    connection_id: connection.id, clinica_id: connection.clinica_id, deduplication_key: key,
    object_type: "whatsapp_business_account", event_type: "message.app_echo", waba_id: entry.id,
    phone_number_id: value.metadata.phone_number_id, meta_message_id: message.id,
    payload: { type: String(message.type || "unknown").slice(0, 40) },
  }, { onConflict: "deduplication_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw error;
  const event = inserted || await retryableWebhookEvent(key, connection);
  if (!event) return;
  const phone = normalizeWhatsAppPhone(message.to);
  if (!phone) throw new Error("Destino do echo invalido.");
  const [client, settings] = await Promise.all([
    resolveClient(connection.clinica_id, phone),
    supabaseAdmin.from("whatsapp_automation_settings").select("privacy_mode").eq("clinica_id", connection.clinica_id).maybeSingle(),
  ]);
  if (settings.error) throw settings.error;
  await insertMetaMessage(supabaseAdmin, {
    clinica_id: connection.clinica_id, connection_id: connection.id, cliente_id: client?.id || null,
    direction: "outbound", message_type: String(message.type || "unknown").slice(0, 40),
    sender_phone: sender, recipient_phone: phone, meta_message_id: message.id, status: "sent",
    trigger: "business_app_echo", content: appEchoContent(message, settings.data?.privacy_mode === "detalhado"),
    sent_at: new Date(Number(message.timestamp) * 1000).toISOString(),
  });
  const done = await supabaseAdmin.from("whatsapp_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", event.id).eq("clinica_id", connection.clinica_id);
  if (done.error) throw done.error;
  const touched = await supabaseAdmin.from("whatsapp_connections").update({ last_webhook_at: new Date().toISOString() }).eq("id", connection.id).eq("clinica_id", connection.clinica_id);
  if (touched.error) throw touched.error;
}

async function processOptionalSync(connection, entry, change) {
  const run = await authorizedImport(connection);
  const key = webhookDeduplicationKey({ field: change.field, waba: entry.id, phone: connection.phone_number_id, payload_hash: hashOpaqueToken(JSON.stringify(change.value)) });
  const prior = await supabaseAdmin.from("whatsapp_webhook_events").select("status").eq("deduplication_key", key).eq("clinica_id", connection.clinica_id).maybeSingle();
  if (prior.error) throw prior.error;
  if (["processed", "ignored"].includes(prior.data?.status)) return;
  const authorized = Boolean(run?.requests?.[change.field === "history" ? "history" : "smb_app_state_sync"]);
  const summary = authorized
    ? await (change.field === "history" ? importHistory : importContacts)({ connection, run, value: change.value || {} })
    : { reason: "sync_not_requested", imported: false };
  const result = await supabaseAdmin.from("whatsapp_webhook_events").upsert({
    connection_id: connection.id, clinica_id: connection.clinica_id,
    deduplication_key: key,
    object_type: "whatsapp_business_account", event_type: change.field,
    waba_id: entry.id, phone_number_id: connection.phone_number_id, status: authorized ? "processed" : "ignored",
    payload: summary, processed_at: new Date().toISOString(),
  }, { onConflict: "deduplication_key", ignoreDuplicates: true });
  if (result.error) throw result.error;
}

export async function ingestWhatsAppWebhook(payload) {
  let processed = 0;
  for (const entry of payload?.entry || []) for (const change of entry?.changes || []) {
    if (!["messages", "smb_message_echoes", "history", "smb_app_state_sync"].includes(change?.field)) continue;
    const value = change?.value || {}; const connection = await resolveConnection(value?.metadata?.phone_number_id, entry.id);
    if (!connection) continue;
    if (change.field !== "messages") {
      if (connection.connection_mode !== "coexistence") continue;
      if (change.field === "smb_message_echoes") {
        for (const message of value.message_echoes || []) { await processAppEcho({ connection, entry, value, message }); processed += 1; }
      } else {
        await processOptionalSync(connection, entry, change);
      }
      continue;
    }
    for (const status of value.statuses || []) { await processStatus({ connection, entry, value, status }); processed += 1; }
    for (const message of value.messages || []) { await processInbound({ connection, entry, value, message }); processed += 1; }
  }
  return { processed };
}
