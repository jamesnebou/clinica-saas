import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export function normalizeAutomationEvent(row) {
  return {
    id: row.id,
    type: row.event_name,
    schema_version: Number(row.schema_version || 1),
    clinica_id: row.clinica_id,
    occurred_at: row.occurred_at,
    actor: row.actor || {},
    subject: { type: row.aggregate_type, id: row.aggregate_id },
    payload: row.payload || {},
    correlation_id: row.correlation_id || row.id,
    causation_id: row.causation_id || null,
    automation_run_id: row.automation_run_id || null,
    automation_depth: Number(row.automation_depth || 0),
  };
}

export async function completeAutomationEvent(id) {
  const { error } = await supabaseAdmin.from("domain_outbox_events").update({ status: "processed", processed_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: null }).eq("id", id).eq("consumer", "automation");
  if (error) throw error;
}

export async function retryAutomationEvent(row, error, maxAttempts = 5) {
  const attempts = Number(row.attempts || 1);
  const permanent = attempts >= maxAttempts || error?.permanent === true;
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
  const availableAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
  const { error: updateError } = await supabaseAdmin.from("domain_outbox_events").update({ status: permanent ? "failed" : "retry", available_at: availableAt, locked_at: null, locked_by: null, last_error: String(error?.message || error || "Falha desconhecida").slice(0, 800) }).eq("id", row.id).eq("consumer", "automation");
  if (updateError) throw updateError;
}

export async function emitAutomationEvent({ clinicId, type, subjectType, subjectId, payload = {}, idempotencyKey, availableAt = new Date().toISOString(), causation = {} }) {
  const row = {
    clinica_id: clinicId, event_name: type, aggregate_type: subjectType, aggregate_id: subjectId,
    payload, idempotency_key: idempotencyKey, consumer: "automation", available_at: availableAt,
    schema_version: 1, correlation_id: causation.correlation_id || null, causation_id: causation.causation_id || null,
    automation_run_id: causation.automation_run_id || null, automation_depth: Number(causation.automation_depth || 0),
  };
  const { data, error } = await supabaseAdmin.from("domain_outbox_events").upsert(row, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw error;
  return data;
}
