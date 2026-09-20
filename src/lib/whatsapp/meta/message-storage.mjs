// The Meta ID index is partial. Plain INSERT + unique violation avoids an invalid
// ON CONFLICT(meta_message_id) target and works for concurrent webhook deliveries.
export async function insertMetaMessage(db, row) {
  if (!row.meta_message_id || typeof row.meta_message_id !== "string") throw new Error("Mensagem Meta sem ID.");
  const result = await db.from("whatsapp_messages").insert(row);
  if (!result.error) return { inserted: true };
  if (result.error.code !== "23505") throw result.error;
  const existing = await db.from("whatsapp_messages")
    .select("id,connection_id,direction,trigger")
    .eq("meta_message_id", row.meta_message_id)
    .eq("clinica_id", row.clinica_id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data || existing.data.connection_id !== row.connection_id || existing.data.direction !== row.direction) {
    throw new Error("Mensagem Meta duplicada com vinculo incompativel.");
  }
  return { inserted: false, trigger: existing.data.trigger };
}

export function appEchoContent(message, detailed) {
  const type = String(message?.type || "unknown").slice(0, 40);
  const text = String(message?.text?.body || message?.button?.text || "").slice(0, 2000);
  return detailed ? { type, text, source: "business_app" } : { type, has_text: Boolean(text), source: "business_app" };
}
