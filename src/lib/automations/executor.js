import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getActionDefinition } from "./registry/actions.mjs";
import { deterministicActionKey } from "./core.mjs";
import { assertClinicOwnerReference, assertTenantReference } from "./context.js";
import { sendAutomationEmail } from "./email.js";

function dueAt(minutes) { return new Date(Date.now() + Math.max(0, Number(minutes || 0)) * 60_000).toISOString(); }
function resultError(message, code, status = "blocked") { return { status, reason: code, message }; }

async function executeCrm(actionType, params, context, run) {
  const opportunity = context.opportunity;
  if (!opportunity) return resultError("A oportunidade não está disponível no contexto.", "OPPORTUNITY_REQUIRED");
  if (["crm.create_activity", "crm.create_follow_up"].includes(actionType)) {
    const { data, error } = await supabaseAdmin.rpc("crm_create_activity", { p_clinica_id: run.clinica_id, p_opportunity_id: opportunity.id, p_tipo: actionType === "crm.create_follow_up" ? "follow_up" : (params.activity_type || "tarefa"), p_titulo: params.title, p_descricao: params.description || null, p_due_at: dueAt(params.due_in_minutes), p_owner_id: opportunity.responsavel_id || null });
    if (error) throw error;
    return { status: "completed", entityType: "crm_activity", entityId: data };
  }
  if (actionType === "crm.assign_owner") {
    await assertClinicOwnerReference(run.clinica_id, params.owner_id);
    const { error } = await supabaseAdmin.from("crm_oportunidades").update({ responsavel_id: params.owner_id }).eq("clinica_id", run.clinica_id).eq("id", opportunity.id);
    if (error) throw error;
    return { status: "completed", entityType: "crm_opportunity", entityId: opportunity.id };
  }
  if (actionType === "crm.add_tag" || actionType === "crm.remove_tag") {
    await assertTenantReference("crm_tags", run.clinica_id, params.tag_id);
    const query = supabaseAdmin.from("crm_opportunity_tags");
    const { error } = actionType === "crm.add_tag"
      ? await query.upsert({ clinica_id: run.clinica_id, opportunity_id: opportunity.id, tag_id: params.tag_id }, { onConflict: "opportunity_id,tag_id", ignoreDuplicates: true })
      : await query.delete().eq("clinica_id", run.clinica_id).eq("opportunity_id", opportunity.id).eq("tag_id", params.tag_id);
    if (error) throw error;
    return { status: "completed", entityType: "crm_opportunity", entityId: opportunity.id };
  }
  if (actionType === "crm.move_stage") {
    const stage = await assertTenantReference("crm_pipeline_stages", run.clinica_id, params.stage_id);
    const { data, error } = await supabaseAdmin.rpc("crm_move_opportunity", { p_clinica_id: run.clinica_id, p_opportunity_id: opportunity.id, p_pipeline_id: opportunity.pipeline_id, p_from_stage_id: opportunity.stage_id, p_to_stage_id: stage.id, p_before_id: null, p_after_id: null, p_sort_order: null });
    if (error) throw error;
    return { status: "completed", entityType: "crm_opportunity", entityId: data || opportunity.id };
  }
  throw Object.assign(new Error("Ação CRM sem executor."), { code: "ACTION_NOT_IMPLEMENTED", permanent: true });
}

async function executeActionEffect(actionType, params, context, run) {
  if (actionType.startsWith("crm.")) return executeCrm(actionType, params, context, run);
  if (actionType === "agenda.register_reminder" || actionType === "finance.create_collection_task" || actionType === "internal.create_notification") {
    const entity = context.booking || context.receivable || context.opportunity || null;
    const title = params.title || (actionType === "agenda.register_reminder" ? "Lembrete de agendamento" : "Notificação da automação");
    const { data, error } = await supabaseAdmin.from("automation_tasks").insert({ clinica_id: run.clinica_id, run_id: run.id, entity_type: run.entity_type || null, entity_id: entity?.id || null, title, description: params.message || params.description || null, due_at: dueAt(params.due_in_minutes), assigned_to: context.opportunity?.responsavel_id || null }).select("id").single();
    if (error) throw error;
    return { status: "completed", entityType: "automation_task", entityId: data.id };
  }
  if (actionType === "communication.send_email") return sendAutomationEmail({ to: context.client?.email, subject: params.subject, message: params.message, idempotencyKey: deterministicActionKey(run.id, run.current_step_index) });
  if (actionType === "communication.send_whatsapp") {
    const { data: connection } = await supabaseAdmin.from("whatsapp_connections").select("id,status").eq("clinica_id", run.clinica_id).eq("status", "active").maybeSingle();
    if (!connection) return resultError("A clínica não possui WhatsApp Oficial ativo.", "WHATSAPP_CONFIGURATION_REQUIRED", "unavailable");
    return resultError("O template deve ser aprovado e enfileirado pelo Notification Engine.", "WHATSAPP_TEMPLATE_CONFIGURATION_REQUIRED", "unavailable");
  }
  if (["agenda.update_status", "finance.create_receivable"].includes(actionType) && process.env.AUTOMATION_ALLOW_HIGH_RISK_ACTIONS !== "true") return resultError("Ação sensível bloqueada pela política do motor.", "HIGH_RISK_ACTION_BLOCKED");
  if (actionType === "agenda.update_status") {
    if (!context.booking) return resultError("Agendamento não disponível.", "BOOKING_REQUIRED");
    const { error } = await supabaseAdmin.from("agendamentos").update({ status: params.status }).eq("clinica_id", run.clinica_id).eq("id", context.booking.id);
    if (error) throw error;
    return { status: "completed", entityType: "booking", entityId: context.booking.id };
  }
  return resultError("Executor ainda não habilitado para esta ação.", "ACTION_NOT_IMPLEMENTED");
}

export async function executeRegisteredAction({ run, step, context }) {
  const definition = getActionDefinition(step.actionType);
  if (!definition) throw Object.assign(new Error("Ação não registrada."), { code: "ACTION_NOT_REGISTERED", permanent: true });
  const idempotencyKey = deterministicActionKey(run.id, step.id);
  const { data: existing } = await supabaseAdmin.from("automation_action_receipts").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing?.status === "completed") return { ...(existing.result || {}), replayed: true };
  if (!existing) {
    const { error } = await supabaseAdmin.from("automation_action_receipts").insert({ clinica_id: run.clinica_id, run_id: run.id, step_id: step.id, action_type: step.actionType, idempotency_key: idempotencyKey, status: "processing" });
    if (error && error.code !== "23505") throw error;
  }
  try {
    const result = await executeActionEffect(step.actionType, step.params || {}, context, run);
    const status = ["blocked", "unavailable"].includes(result.status) ? result.status : "completed";
    await supabaseAdmin.from("automation_action_receipts").update({ status, entity_type: result.entityType || null, entity_id: result.entityId ? String(result.entityId) : null, result, completed_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    return result;
  } catch (error) {
    await supabaseAdmin.from("automation_action_receipts").update({ status: "failed", result: { code: error.code || "ACTION_FAILED", message: String(error.message || error).slice(0, 500) }, completed_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    throw error;
  }
}
