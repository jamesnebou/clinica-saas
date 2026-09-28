import { buildTemplateSubmission, TEMPLATE_CATALOG, templateContentMatches } from "./meta/templates.js";

export async function prepareConnectionTemplates({ db, connection, provider, existing }) {
  if (!connection?.id || !connection?.clinica_id || !connection?.waba_id) throw new Error("Invalid template connection");
  const current = new Map(existing
    .filter((item) => item.clinica_id === connection.clinica_id && item.connection_id === connection.id && item.waba_id === connection.waba_id && item.status !== "DELETED")
    .map((item) => [`${item.name}:${item.language}`, item]));
  const result = { submitted: 0, updated: 0, blocked: 0 };
  for (const purpose of Object.keys(TEMPLATE_CATALOG)) {
    const payload = buildTemplateSubmission(purpose);
    const item = current.get(`${payload.name}:${payload.language}`);
    if (!item) {
      await provider.client.createTemplate(connection.waba_id, payload);
      result.submitted++;
      continue;
    }
    if (templateContentMatches(item, payload)) continue;
    if (!item.meta_template_id || !["APPROVED", "REJECTED", "PAUSED"].includes(item.status)) {
      result.blocked++;
      continue;
    }
    await provider.client.updateTemplate(item.meta_template_id, payload.components);
    // Editing is not approval. Keep jobs waiting until the next authoritative sync.
    const { error } = await db.from("whatsapp_templates")
      .update({ status: "PENDING", components: payload.components, last_synced_at: null })
      .eq("id", item.id).eq("clinica_id", connection.clinica_id)
      .eq("connection_id", connection.id).eq("waba_id", connection.waba_id);
    if (error) throw error;
    result.updated++;
  }
  return result;
}
