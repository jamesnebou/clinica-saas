import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function auditAutomation({ clinicId, actorId = null, action, entityType, entityId, metadata = {} }) {
  const safe = { ...metadata };
  delete safe.context;
  delete safe.payload;
  const { error } = await supabaseAdmin.from("auditoria_clinica").insert({ clinica_id: clinicId, actor_id: actorId, acao: action, entidade_tipo: entityType, entidade_id: entityId ? String(entityId) : null, metadata: safe });
  if (error) console.error("Falha de auditoria da automação:", error.code || error.message);
}

export async function recordAutomationMetric({ clinicId, name, runId, metadata = {} }) {
  const { error } = await supabaseAdmin.from("eventos_analiticos").insert({ clinica_id: clinicId, event_name: name, idempotency_key: `${name}:${runId}`, metadata: { run_id: runId, ...metadata } });
  if (error && error.code !== "23505") console.error("Falha de métrica da automação:", error.code || error.message);
}
