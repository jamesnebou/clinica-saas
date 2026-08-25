import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone } from "./core.mjs";
export async function emitDomainEvent({ clinicId, eventName, aggregateType = "agendamento", aggregateId, payload = {}, idempotencyKey, occurredAt = new Date().toISOString() }) {
  if (!clinicId || !aggregateId || !eventName || !idempotencyKey) throw new Error("Evento de domínio incompleto.");
  const { data, error } = await supabaseAdmin.from("domain_outbox_events").upsert({ clinica_id: clinicId, event_name: eventName, aggregate_type: aggregateType, aggregate_id: aggregateId, payload, idempotency_key: idempotencyKey, occurred_at: occurredAt }, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) throw error;
  return data;
}
export async function upsertTransactionalConsent({ clinicId, clientId, phone, accepted, source = "public_booking", textVersion = "whatsapp-transactional-v1" }) {
  const normalized = normalizeWhatsAppPhone(phone); if (!normalized) return null; const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("communication_preferences").upsert({ clinica_id: clinicId, cliente_id: clientId || null, phone_normalized: normalized, whatsapp_transactional_opt_in: Boolean(accepted), opt_in_source: source, opt_in_at: accepted ? now : null, opt_out_at: accepted ? null : now, text_version: textVersion }, { onConflict: "clinica_id,phone_normalized" }).select("id").single();
  if (error && !["42P01", "PGRST205"].includes(error.code)) throw error; return data;
}
