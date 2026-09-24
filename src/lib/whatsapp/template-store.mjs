import { templatePurposeFromName } from "./meta/templates.js";

const META_TEMPLATE_STATUSES = new Set(["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED", "IN_APPEAL", "PENDING_DELETION", "DELETED", "LIMIT_EXCEEDED"]);

export async function readConnectionTemplates(db, connection) {
  if (!connection?.id || !connection?.clinica_id || !connection?.waba_id) return { data: [], error: null };
  return db.from("whatsapp_templates").select("*")
    .eq("clinica_id", connection.clinica_id).eq("connection_id", connection.id)
    .eq("waba_id", connection.waba_id).order("updated_at", { ascending: false });
}

export async function syncTemplateStore(db, connection, provider) {
  if (!connection?.id || !connection?.clinica_id || !connection?.waba_id) throw new Error("Invalid template connection");
  const remote = await provider.syncTemplates(connection);
  if (!Array.isArray(remote) || remote.some((item) => !item || typeof item.name !== "string" || !item.name)) throw new Error("Invalid template response");
  const syncedAt = new Date().toISOString();
  const { data: existing, error: readError } = await readConnectionTemplates(db, connection);
  if (readError) throw readError;
  const rows = remote.filter((item) => templatePurposeFromName(item.name)).map((item) => ({
    clinica_id: connection.clinica_id, connection_id: connection.id, waba_id: connection.waba_id,
    meta_template_id: item.id || null, name: item.name, language: item.language || "pt_BR",
    category: item.category || null, status: META_TEMPLATE_STATUSES.has(item.status) ? item.status : "PENDING",
    components: item.components || [], purpose: templatePurposeFromName(item.name),
    rejection_reason: item.rejected_reason || null, last_synced_at: syncedAt,
  }));
  for (const row of rows) {
    const { error } = await db.from("whatsapp_templates").upsert(row, { onConflict: "connection_id,name,language" });
    if (error) throw error;
  }
  // Only a complete remote snapshot can invalidate a cached approval; keep its history.
  const remoteKeys = new Set(rows.map((row) => JSON.stringify([row.name, row.language])));
  for (const row of existing || []) {
    if (!templatePurposeFromName(row.name)) continue;
    if (remoteKeys.has(JSON.stringify([row.name, row.language]))) continue;
    const { error } = await db.from("whatsapp_templates")
      .update({ status: "DELETED", last_synced_at: syncedAt })
      .eq("id", row.id).eq("clinica_id", connection.clinica_id)
      .eq("connection_id", connection.id).eq("waba_id", connection.waba_id);
    if (error) throw error;
  }
  return { total: rows.length, remoteTotal: remote.length };
}

// Reuse the same request (including a failure) for all jobs of a connection in this batch.
export function createTemplateRefresher(db, provider) {
  const requests = new Map();
  return (connection) => {
    const key = JSON.stringify([connection.clinica_id, connection.id, connection.waba_id]);
    if (!requests.has(key)) requests.set(key, syncTemplateStore(db, connection, provider));
    return requests.get(key);
  };
}
