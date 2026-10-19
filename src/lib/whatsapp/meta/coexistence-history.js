import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone } from "../core.mjs";
import { insertMetaMessage } from "./message-storage.mjs";

const MIN_TIMESTAMP_SECONDS = 1_000_000_000;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

export class InvalidCoexistenceTimestampError extends Error {
  constructor(reason) {
    super("Timestamp de importacao invalido.");
    this.name = "InvalidCoexistenceTimestampError";
    this.reason = reason;
  }
}

function timestampDigits(value) {
  if (value === null || value === undefined || value === "") throw new InvalidCoexistenceTimestampError("timestamp_missing");
  if (typeof value === "number" && Number.isInteger(value) && value < 0) throw new InvalidCoexistenceTimestampError("timestamp_out_of_range");
  if (typeof value !== "number" && typeof value !== "string") throw new InvalidCoexistenceTimestampError("timestamp_invalid_type");
  const digits = String(value);
  if (!/^\d+$/.test(digits)) throw new InvalidCoexistenceTimestampError("timestamp_invalid_type");
  const number = Number(digits);
  if (!Number.isSafeInteger(number)) throw new InvalidCoexistenceTimestampError("timestamp_out_of_range");
  return { number, digitCount: digits.length };
}

function checkedDate(milliseconds, now) {
  const date = new Date(milliseconds);
  if (!Number.isFinite(now) || Number.isNaN(date.getTime()) ||
      milliseconds < MIN_TIMESTAMP_SECONDS * 1000 || milliseconds > now + MAX_FUTURE_MS) {
    throw new InvalidCoexistenceTimestampError("timestamp_out_of_range");
  }
  return date.toISOString();
}

export function parseHistoryTimestamp(value, now = Date.now()) {
  const { number, digitCount } = timestampDigits(value);
  if (digitCount !== 10) throw new InvalidCoexistenceTimestampError("timestamp_out_of_range");
  return { seconds: number, iso: checkedDate(number * 1000, now) };
}

export function parseContactTimestamp(value, action, now = Date.now()) {
  if (action === "remove" && (value === 0 || value === "0")) return { seconds: 0, iso: null, unit: "unknown" };
  const { number, digitCount } = timestampDigits(value);
  if (digitCount === 11 || digitCount === 12) throw new InvalidCoexistenceTimestampError("timestamp_ambiguous");
  if (digitCount === 10) return { seconds: number, iso: checkedDate(number * 1000, now), unit: "seconds" };
  if (digitCount === 13) return { seconds: Math.floor(number / 1000), iso: checkedDate(number, now), unit: "milliseconds" };
  throw new InvalidCoexistenceTimestampError("timestamp_out_of_range");
}

function importTimestamp(value, source, field, invalid, action) {
  try { return source === "history" ? parseHistoryTimestamp(value) : parseContactTimestamp(value, action); }
  catch (error) {
    if (!(error instanceof InvalidCoexistenceTimestampError)) throw error;
    invalid.count += 1;
    if (invalid.samples.length < 3) {
      invalid.samples.push({
        source, field, ...(source === "contact" ? { action } : {}),
        typeof: typeof value,
        digit_count: typeof value === "string" && /^\d+$/.test(value) ? value.length
          : typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value).length : null,
        numeric: typeof value === "string" ? /^\d+$/.test(value)
          : typeof value === "number" && Number.isFinite(value),
        reason: error.reason,
      });
    }
    return null;
  }
}

export async function importHistory({ connection, run, value }) {
  const settings = await supabaseAdmin.from("whatsapp_automation_settings").select("privacy_mode").eq("clinica_id", connection.clinica_id).maybeSingle();
  if (settings.error) throw settings.error;
  const detailed = settings.data?.privacy_mode === "detalhado";
  const own = normalizeWhatsAppPhone(connection.display_phone_number);
  if (!own) throw new Error("Numero da conexao ausente.");
  let imported = 0;
  const invalid = { count: 0, samples: [] };
  const errorCodes = [];
  for (const chunk of value.history || []) {
    for (const error of chunk.errors || []) if (Number.isSafeInteger(error.code)) errorCodes.push(error.code);
    for (const thread of chunk.threads || []) {
      const contact = normalizeWhatsAppPhone(thread.id);
      if (!contact) continue;
      for (const message of thread.messages || []) {
        const from = normalizeWhatsAppPhone(message.from);
        if (from !== own && from !== contact) throw new Error("Mensagem historica fora da conversa autorizada.");
        const outbound = from === own;
        const type = String(message.type || "unknown").slice(0, 40);
        const text = String(message.text?.body || message.button?.text || message[type]?.caption || "").slice(0, 2000);
        const parsed = importTimestamp(message.timestamp, "history", "history.message.timestamp", invalid);
        if (!parsed) continue;
        const sentAt = parsed.iso;
        const client = await supabaseAdmin.from("clientes").select("id").eq("clinica_id", connection.clinica_id).eq("telefone_whatsapp", contact).limit(1).maybeSingle();
        if (client.error) throw client.error;
        const statuses = { DELIVERED: "delivered", READ: "read", PLAYED: "read", ERROR: "failed", PENDING: "submitted", SENT: "sent" };
        const stored = await insertMetaMessage(supabaseAdmin, {
          clinica_id: connection.clinica_id, connection_id: connection.id, cliente_id: client.data?.id || null,
          meta_message_id: message.id, direction: outbound ? "outbound" : "inbound",
          message_type: type, sender_phone: from, recipient_phone: outbound ? contact : own,
          status: outbound ? statuses[message.history_context?.status] || "sent" : "received",
          trigger: "business_app_history", created_at: sentAt, [outbound ? "sent_at" : "received_at"]: sentAt,
          content: { source: "business_app_history", import_id: run.id, type, ...(detailed ? { text } : { has_text: Boolean(text) }) },
        });
        if (stored.inserted) imported += 1;
      }
    }
  }
  // Meta can deliver media details later, under value.messages, without the thread.
  // Only enrich a known historical placeholder; never download media automatically.
  for (const message of value.messages || []) {
    const existing = await supabaseAdmin.from("whatsapp_messages").select("id,message_type,trigger,content")
      .eq("clinica_id", connection.clinica_id).eq("connection_id", connection.id).eq("meta_message_id", message.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.trigger !== "business_app_history" || existing.data.message_type !== "media_placeholder") continue;
    const type = String(message.type || "unknown").slice(0, 40);
    const caption = String(message[type]?.caption || "").slice(0, 2000);
    const result = await supabaseAdmin.from("whatsapp_messages").update({
      message_type: type, content: { ...existing.data.content, type, ...(detailed ? { text: caption } : { has_text: Boolean(caption) }) },
    }).eq("id", existing.data.id).eq("clinica_id", connection.clinica_id).eq("message_type", "media_placeholder");
    if (result.error) throw result.error;
  }
  return { imported, invalid_timestamp_count: invalid.count, invalid_timestamp_samples: invalid.samples,
    error_codes: [...new Set(errorCodes)], history_shared: !errorCodes.includes(2593109) };
}

export async function importContacts({ connection, run, value }) {
  let imported = 0;
  const invalid = { count: 0, samples: [] };
  for (const item of value.state_sync || []) {
    if (item.type !== "contact" || !["add", "remove"].includes(item.action)) continue;
    const phone = normalizeWhatsAppPhone(item.contact?.phone_number);
    if (!phone) continue;
    const parsed = importTimestamp(item.metadata?.timestamp, "contact", "state_sync.metadata.timestamp", invalid, item.action);
    if (!parsed) continue;
    const row = {
      clinica_id: connection.clinica_id, connection_id: connection.id, import_id: run.id,
      phone_normalized: phone, full_name: item.action === "remove" ? null : String(item.contact.full_name || item.contact.first_name || "").slice(0, 200),
      removed: item.action === "remove", source_timestamp: parsed.seconds, updated_at: new Date().toISOString(),
    };
    const result = await supabaseAdmin.from("whatsapp_imported_contacts").insert(row);
    if (result.error && result.error.code !== "23505") throw result.error;
    if (result.error) {
      const update = supabaseAdmin.from("whatsapp_imported_contacts").update(row)
        .eq("clinica_id", connection.clinica_id).eq("connection_id", connection.id).eq("phone_normalized", phone);
      // A historical remove has no event time; keep its tombstone ahead of older adds.
      if (parsed.unit === "unknown") update.eq("removed", false);
      else update.lt("source_timestamp", row.source_timestamp).gt("source_timestamp", 0);
      const updated = await update;
      if (updated.error) throw updated.error;
      // A later add can replace an undated tombstone only when its real event time
      // is after the tombstone was received; updated_at is not the removal time.
      if (item.action === "add") {
        const restored = await supabaseAdmin.from("whatsapp_imported_contacts").update(row)
          .eq("clinica_id", connection.clinica_id).eq("connection_id", connection.id).eq("phone_normalized", phone)
          .eq("removed", true).eq("source_timestamp", 0).lt("updated_at", parsed.iso);
        if (restored.error) throw restored.error;
      }
    } else imported += 1;
  }
  return { imported, invalid_timestamp_count: invalid.count, invalid_timestamp_samples: invalid.samples };
}
