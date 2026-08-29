import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getActionDefinition } from "./registry/actions.mjs";
import { deterministicActionKey } from "./core.mjs";
import { assertClinicOwnerReference, assertTenantReference } from "./context.js";
import { sendAutomationEmail } from "./email.js";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/core.mjs";
import { canExecuteAutomationAction } from "./risk-policy.mjs";

function dueAt(minutes) { return new Date(Date.now() + Math.max(0, Number(minutes || 0)) * 60_000).toISOString(); }
function resultError(message, code, status = "blocked") { return { status, reason: code, message }; }

async function attachAutomationLineage({ run, eventName, payload }) {
  let query = supabaseAdmin
    .from("domain_outbox_events")
    .select("id")
    .eq("clinica_id", run.clinica_id)
    .eq("consumer", "automation")
    .eq("event_name", eventName)
    .eq("aggregate_type", "crm_opportunity")
    .eq("aggregate_id", run.entity_id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (payload && Object.keys(payload).length) query = query.contains("payload", payload);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.id) return;
  const { error: updateError } = await supabaseAdmin.from("domain_outbox_events").update({
    correlation_id: run.correlation_id || String(run.source_event_id || run.id),
    causation_id: String(run.source_event_id || run.id),
    automation_run_id: run.id,
    automation_depth: Number(run.automation_depth || 0) + 1,
  }).eq("id", data.id).eq("clinica_id", run.clinica_id);
  if (updateError) throw updateError;
}

async function executeCrm(actionType, params, context, run) {
  const opportunity = context.opportunity;
  if (!opportunity) return resultError("A oportunidade não está disponível no contexto.", "OPPORTUNITY_REQUIRED");
  if (["crm.create_activity", "crm.create_follow_up"].includes(actionType)) {
    const { data, error } = await supabaseAdmin.rpc("crm_create_activity", { p_clinica_id: run.clinica_id, p_opportunity_id: opportunity.id, p_tipo: actionType === "crm.create_follow_up" ? "follow_up" : (params.activity_type || "tarefa"), p_titulo: params.title, p_descricao: params.description || null, p_due_at: dueAt(params.due_in_minutes), p_owner_id: opportunity.responsavel_id || null });
    if (error) throw error;
    await attachAutomationLineage({ run, eventName: "crm.activity.created", payload: data?.id ? { activity_id: data.id } : null });
    return { status: "completed", entityType: "crm_activity", entityId: data?.id || data };
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
    const { data, error } = await supabaseAdmin.rpc("crm_move_opportunity", {
      p_clinica_id: run.clinica_id,
      p_opportunity_id: opportunity.id,
      p_stage_id: stage.id,
      p_before_id: null,
      p_after_id: null,
      p_lost_reason_id: null,
      p_closed_value: null,
    });
    if (error) throw error;
    await attachAutomationLineage({ run, eventName: "crm.stage.changed", payload: { to_stage_id: stage.id } });
    return { status: "completed", entityType: "crm_opportunity", entityId: data || opportunity.id };
  }
  throw Object.assign(new Error("Ação CRM sem executor."), { code: "ACTION_NOT_IMPLEMENTED", permanent: true });
}

async function executeActionEffect(actionType, params, context, run, idempotencyKey) {
  if (actionType.startsWith("crm.")) return executeCrm(actionType, params, context, run);
  if (actionType === "agenda.register_reminder" || actionType === "finance.create_collection_task" || actionType === "internal.create_notification") {
    const entity = context.booking || context.receivable || context.opportunity || null;
    const title = params.title || (actionType === "agenda.register_reminder" ? "Lembrete de agendamento" : "Notificação da automação");
    const { data, error } = await supabaseAdmin.from("automation_tasks").insert({ clinica_id: run.clinica_id, run_id: run.id, entity_type: run.entity_type || null, entity_id: entity?.id || null, title, description: params.message || params.description || null, due_at: dueAt(params.due_in_minutes), assigned_to: context.opportunity?.responsavel_id || null, idempotency_key: idempotencyKey }).select("id").maybeSingle();
    if (error && error.code !== "23505") throw error;
    if (data?.id) return { status: "completed", entityType: "automation_task", entityId: data.id };
    const existing = await supabaseAdmin.from("automation_tasks").select("id").eq("clinica_id", run.clinica_id).eq("idempotency_key", idempotencyKey).single();
    if (existing.error) throw existing.error;
    return { status: "completed", entityType: "automation_task", entityId: existing.data.id, replayed: true };
  }
  if (actionType === "communication.send_email") return sendAutomationEmail({ to: context.client?.email, subject: params.subject, message: params.message, idempotencyKey });
  if (actionType === "communication.send_whatsapp") {
    const recipient = normalizeWhatsAppPhone(context.client?.telefone);
    if (!recipient) return resultError("O cliente não possui um WhatsApp válido.", "WHATSAPP_RECIPIENT_REQUIRED", "unavailable");
    if (!context.booking || !run.source_event_id) {
      return resultError("O Notification Engine atual exige um agendamento vinculado ao evento.", "WHATSAPP_BOOKING_CONTEXT_REQUIRED", "unavailable");
    }
    const [{ data: connection, error: connectionError }, { data: template, error: templateError }] = await Promise.all([
      supabaseAdmin.from("whatsapp_connections").select("id,onboarding_status,connection_status").eq("clinica_id", run.clinica_id).eq("is_primary", true).maybeSingle(),
      supabaseAdmin.from("whatsapp_templates").select("id,purpose,status").eq("clinica_id", run.clinica_id).eq("purpose", params.template_purpose).eq("status", "APPROVED").maybeSingle(),
    ]);
    if (connectionError) throw connectionError;
    if (templateError) throw templateError;
    if (!connection || connection.onboarding_status !== "ready" || connection.connection_status !== "connected") {
      return resultError("A clínica não possui WhatsApp Oficial pronto para envio.", "WHATSAPP_CONFIGURATION_REQUIRED", "unavailable");
    }
    if (!template) return resultError("O template oficial informado não está aprovado.", "WHATSAPP_TEMPLATE_CONFIGURATION_REQUIRED", "unavailable");
    const scheduledAt = run.created_at || run.started_at || new Date().toISOString();
    const { data: job, error } = await supabaseAdmin.from("notification_jobs").upsert({
      clinica_id: run.clinica_id,
      event_id: run.source_event_id,
      channel: "whatsapp",
      recipient,
      template_purpose: params.template_purpose,
      scheduled_at: scheduledAt,
    }, { onConflict: "event_id,channel,recipient,template_purpose,scheduled_at", ignoreDuplicates: true }).select("id").maybeSingle();
    if (error) throw error;
    return { status: "completed", entityType: "notification_job", entityId: job?.id || null, queued: true };
  }
  if (!canExecuteAutomationAction(actionType, process.env.AUTOMATION_ALLOW_HIGH_RISK_ACTIONS === "true")) return resultError("Ação sensível bloqueada pela política do motor.", "HIGH_RISK_ACTION_BLOCKED");
  if (actionType === "agenda.update_status") {
    if (!context.booking) return resultError("Agendamento não disponível.", "BOOKING_REQUIRED");
    const { error } = await supabaseAdmin.from("agendamentos").update({ status: params.status }).eq("clinica_id", run.clinica_id).eq("id", context.booking.id);
    if (error) throw error;
    return { status: "completed", entityType: "booking", entityId: context.booking.id };
  }
  if (actionType === "finance.create_receivable") {
    const [category, costCenter] = await Promise.all([
      assertTenantReference("finance_categorias", run.clinica_id, params.category_id),
      assertTenantReference("finance_centros_custo", run.clinica_id, params.cost_center_id),
    ]);
    const amount = Number(params.amount);
    if (!Number.isFinite(amount) || amount <= 0) return resultError("Informe um valor financeiro maior que zero.", "INVALID_RECEIVABLE_AMOUNT");
    const dueDate = String(params.due_date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return resultError("Informe o vencimento no formato AAAA-MM-DD.", "INVALID_RECEIVABLE_DUE_DATE");
    const originId = idempotencyKey;
    const { data: receivable, error } = await supabaseAdmin.from("finance_recebiveis").upsert({
      clinica_id: run.clinica_id,
      cliente_id: context.client?.id || null,
      profissional_id: context.booking?.profissional_id || null,
      procedimento_id: context.booking?.procedimento_id || null,
      agendamento_id: context.booking?.id || null,
      categoria_id: category.id,
      centro_custo_id: costCenter.id,
      descricao: params.description,
      origem_tipo: "automation",
      origem_id: originId,
      valor_original: amount,
      competencia: `${dueDate.slice(0, 7)}-01`,
      vencimento: dueDate,
      metadata: { automation_run_id: run.id, automation_step_id: idempotencyKey },
    }, { onConflict: "clinica_id,origem_tipo,origem_id", ignoreDuplicates: true }).select("id,valor_total,vencimento").maybeSingle();
    if (error) throw error;
    let target = receivable;
    if (!target) {
      const existing = await supabaseAdmin.from("finance_recebiveis").select("id,valor_total,vencimento").eq("clinica_id", run.clinica_id).eq("origem_tipo", "automation").eq("origem_id", originId).single();
      if (existing.error) throw existing.error;
      target = existing.data;
    }
    const { error: installmentError } = await supabaseAdmin.from("finance_recebivel_parcelas").upsert({
      clinica_id: run.clinica_id,
      recebivel_id: target.id,
      numero: 1,
      vencimento: target.vencimento,
      valor: Number(target.valor_total || amount),
    }, { onConflict: "recebivel_id,numero", ignoreDuplicates: true });
    if (installmentError) throw installmentError;
    return { status: "completed", entityType: "finance_receivable", entityId: target.id };
  }
  return resultError("Executor ainda não habilitado para esta ação.", "ACTION_NOT_IMPLEMENTED");
}

export async function executeRegisteredAction({ run, step, context }) {
  const definition = getActionDefinition(step.actionType);
  if (!definition) throw Object.assign(new Error("Ação não registrada."), { code: "ACTION_NOT_REGISTERED", permanent: true });
  const idempotencyKey = deterministicActionKey(run.id, step.id);
  const { data: existing, error: existingError } = await supabaseAdmin.from("automation_action_receipts").select("*").eq("clinica_id", run.clinica_id).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "completed") return { ...(existing.result || {}), replayed: true };
  if (existing?.status === "processing") {
    const updatedAt = Date.parse(existing.updated_at || existing.created_at || "");
    const stale = Number.isFinite(updatedAt) && updatedAt < Date.now() - 10 * 60_000;
    if (!stale) {
      throw Object.assign(new Error("A ação já está sendo processada por outro worker."), { code: "ACTION_ALREADY_PROCESSING", transient: true });
    }
  }
  if (!existing) {
    const { error } = await supabaseAdmin.from("automation_action_receipts").insert({ clinica_id: run.clinica_id, run_id: run.id, step_id: step.id, action_type: step.actionType, idempotency_key: idempotencyKey, status: "processing", updated_at: new Date().toISOString() });
    if (error?.code === "23505") {
      const concurrent = await supabaseAdmin.from("automation_action_receipts").select("status,result").eq("clinica_id", run.clinica_id).eq("idempotency_key", idempotencyKey).single();
      if (concurrent.error) throw concurrent.error;
      if (concurrent.data.status === "completed") return { ...(concurrent.data.result || {}), replayed: true };
      throw Object.assign(new Error("A ação foi reivindicada por outro worker."), { code: "ACTION_ALREADY_PROCESSING", transient: true });
    }
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from("automation_action_receipts").update({ status: "processing", completed_at: null, updated_at: new Date().toISOString() }).eq("clinica_id", run.clinica_id).eq("idempotency_key", idempotencyKey);
    if (error) throw error;
  }
  try {
    const result = await executeActionEffect(step.actionType, step.params || {}, context, run, idempotencyKey);
    const status = result.status === "configuration_required"
      ? "unavailable"
      : ["blocked", "unavailable"].includes(result.status)
        ? result.status
        : "completed";
    await supabaseAdmin.from("automation_action_receipts").update({ status, entity_type: result.entityType || null, entity_id: result.entityId ? String(result.entityId) : null, result, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("clinica_id", run.clinica_id).eq("idempotency_key", idempotencyKey);
    return result;
  } catch (error) {
    await supabaseAdmin.from("automation_action_receipts").update({ status: "failed", result: { code: error.code || "ACTION_FAILED", message: String(error.message || error).slice(0, 500) }, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("clinica_id", run.clinica_id).eq("idempotency_key", idempotencyKey);
    throw error;
  }
}
