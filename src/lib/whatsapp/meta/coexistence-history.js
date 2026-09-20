import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone } from "../core.mjs";
import { insertMetaMessage } from "./message-storage.mjs";

function timestamp(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0 || number > 8_640_000_000_000) throw new Error("Timestamp de importacao invalido.");
  return number;
}

export async function importHistory({ connection, run, value }) {
  const settings = await supabaseAdmin.from("whatsapp_automation_settings").select("privacy_mode").eq("clinica_id", connection.clinica_id).maybeSingle();
  if (settings.error) throw settings.error;
  const detailed = settings.data?.privacy_mode === "detalhado";
  const own = normalizeWhatsAppPhone(connection.display_phone_number);
  if (!own) throw new Error("Numero da conexao ausente.");
  let imported = 0;
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
        const sentAt = new Date(timestamp(message.timestamp) * 1000).toISOString();
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
  return { imported, error_codes: [...new Set(errorCodes)], history_shared: !errorCodes.includes(2593109) };
}

export async function importContacts({ connection, run, value }) {
  let imported = 0;
  for (const item of value.state_sync || []) {
    if (item.type !== "contact" || !["add", "remove"].includes(item.action)) continue;
    const phone = normalizeWhatsAppPhone(item.contact?.phone_number);
    if (!phone) continue;
    const row = {
      clinica_id: connection.clinica_id, connection_id: connection.id, import_id: run.id,
      phone_normalized: phone, full_name: item.action === "remove" ? null : String(item.contact.full_name || item.contact.first_name || "").slice(0, 200),
      removed: item.action === "remove", source_timestamp: timestamp(item.metadata?.timestamp), updated_at: new Date().toISOString(),
    };
    const result = await supabaseAdmin.from("whatsapp_imported_contacts").insert(row);
    if (result.error && result.error.code !== "23505") throw result.error;
    if (result.error) {
      const update = await supabaseAdmin.from("whatsapp_imported_contacts").update(row)
        .eq("clinica_id", connection.clinica_id).eq("connection_id", connection.id).eq("phone_normalized", phone)
        .lt("source_timestamp", row.source_timestamp);
      if (update.error) throw update.error;
    } else imported += 1;
  }
  return { imported };
}
