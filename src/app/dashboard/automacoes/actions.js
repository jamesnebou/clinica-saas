"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClinicSection } from "@/lib/auth/session";
import { getCurrentMembership } from "@/lib/auth/permissions";
import { getAutomationTemplate } from "@/lib/automations/templates.mjs";
import { validateAutomationDefinition } from "@/lib/automations/validation.mjs";
import { resolveAutomationLimits } from "@/lib/automations/limits.mjs";
import { assertAutomationOperation } from "@/lib/automations/permissions.mjs";
import { auditAutomation } from "@/lib/automations/observability";
import { getClinicPlan } from "@/lib/saas/plans";
import { getClinicCapabilities } from "@/lib/segments/service";

function text(fd, key) { return String(fd.get(key) || "").trim(); }

function requireOperation(context, operation) {
  const membership = getCurrentMembership(context.memberships, context.activeClinic?.id);
  assertAutomationOperation(membership?.papel, operation);
}

async function getValidationOptions({ activeClinic, supabase }) {
  const plan = await getClinicPlan(activeClinic);
  const capabilities = await getClinicCapabilities({ clinic: activeClinic, plan, client: supabase });
  const metadata = {
    ...(plan?.metadata || {}),
    ...(activeClinic?.metadata || {}),
    automation_limits: {
      ...(plan?.metadata?.automation_limits || {}),
      ...(activeClinic?.metadata?.automation_limits || {}),
    },
  };
  return { capabilities: capabilities.effective, limits: resolveAutomationLimits(metadata) };
}

export async function createAutomationAction(fd) {
  const context = await requireClinicSection("automacoes");
  requireOperation(context, "manage");
  const { activeClinic, user, supabase } = context;
  const template = getAutomationTemplate(text(fd, "template_id"));
  const definition = template ? template.definition : { schemaVersion: 1, trigger: { type: "crm.opportunity.created", reentry: "deny_self" }, conditions: { kind: "group", operator: "AND", conditions: [] }, steps: [{ id: "notify", type: "action", actionType: "internal.create_notification", params: { title: "Nova oportunidade", message: "Revise esta oportunidade." } }] };
  const { data, error } = await supabase.from("automations").insert({ clinica_id: activeClinic.id, name: text(fd, "name") || template?.name || "Nova automação", description: template?.description || null, status: "draft", trigger_type: definition.trigger.type, draft_definition: definition, owner_id: user.id, metadata: template ? { template_id: template.id } : {} }).select("id").single();
  if (error) throw error;
  await auditAutomation({ clinicId: activeClinic.id, actorId: user.id, action: "automation.created", entityType: "automation", entityId: data.id, metadata: { template_id: template?.id || null } });
  redirect(`/dashboard/automacoes/${data.id}`);
}

export async function saveAutomationDraftAction(fd) {
  const context = await requireClinicSection("automacoes");
  requireOperation(context, "manage");
  const { activeClinic, user, supabase } = context;
  const id = text(fd, "automation_id");
  const options = await getValidationOptions({ activeClinic, supabase });
  const validation = validateAutomationDefinition(text(fd, "definition_json"), options);
  if (!validation.definition) redirect(`/dashboard/automacoes/${id}?error=definition`);
  const { error } = await supabase.from("automations").update({ name: text(fd, "name"), description: text(fd, "description") || null, trigger_type: validation.definition.trigger.type, draft_definition: validation.definition, status: text(fd, "current_status") === "active" ? "active" : "draft", updated_at: new Date().toISOString() }).eq("clinica_id", activeClinic.id).eq("id", id);
  if (error) throw error;
  await auditAutomation({ clinicId: activeClinic.id, actorId: user.id, action: "automation.draft_saved", entityType: "automation", entityId: id, metadata: { valid: validation.valid, step_count: validation.counts?.steps || 0 } });
  revalidatePath(`/dashboard/automacoes/${id}`);
  redirect(`/dashboard/automacoes/${id}?saved=1${validation.valid ? "" : "&warning=invalid"}`);
}

export async function publishAutomationAction(fd) {
  const context = await requireClinicSection("automacoes");
  requireOperation(context, "publish");
  const { activeClinic, user, supabase } = context;
  const id = text(fd, "automation_id");
  const { data: automation, error: readError } = await supabase.from("automations").select("draft_definition").eq("clinica_id", activeClinic.id).eq("id", id).single();
  if (readError) throw readError;
  const options = await getValidationOptions({ activeClinic, supabase });
  const validation = validateAutomationDefinition(automation.draft_definition, options);
  if (!validation.valid) redirect(`/dashboard/automacoes/${id}?error=publish&details=${encodeURIComponent(validation.errors.slice(0, 3).join(" | "))}`);
  const limits = options.limits;
  if (limits.maxActiveAutomations !== null) {
    const { count, error: countError } = await supabase.from("automations").select("id", { count: "exact", head: true }).eq("clinica_id", activeClinic.id).eq("status", "active").neq("id", id);
    if (countError) throw countError;
    if (Number(count || 0) >= limits.maxActiveAutomations) redirect(`/dashboard/automacoes/${id}?error=limit&details=${encodeURIComponent(`Seu plano permite até ${limits.maxActiveAutomations} automações ativas.`)}`);
  }
  const json = JSON.stringify(validation.definition);
  const hash = createHash("sha256").update(json).digest("hex");
  const { error } = await supabase.rpc("publish_automation_v2", { p_clinica_id: activeClinic.id, p_automation_id: id, p_definition: validation.definition, p_trigger_type: validation.definition.trigger.type, p_definition_hash: hash, p_actor_id: user.id });
  if (error) throw error;
  revalidatePath("/dashboard/automacoes");
  redirect(`/dashboard/automacoes/${id}?published=1`);
}

export async function setAutomationStatusAction(fd) {
  const context = await requireClinicSection("automacoes");
  requireOperation(context, "manage");
  const { activeClinic, user, supabase } = context;
  const id = text(fd, "automation_id");
  const status = ["active", "paused", "archived"].includes(text(fd, "status")) ? text(fd, "status") : "paused";
  const { error } = await supabase.from("automations").update({ status, updated_at: new Date().toISOString() }).eq("clinica_id", activeClinic.id).eq("id", id);
  if (error) throw error;
  await auditAutomation({ clinicId: activeClinic.id, actorId: user.id, action: "automation.status_changed", entityType: "automation", entityId: id, metadata: { status } });
  revalidatePath("/dashboard/automacoes");
}

export async function cancelAutomationRunAction(fd) {
  const context = await requireClinicSection("automacoes");
  requireOperation(context, "runs");
  const { activeClinic, user, supabase } = context;
  const { error } = await supabase.rpc("cancel_automation_run", { p_clinica_id: activeClinic.id, p_run_id: text(fd, "run_id") });
  if (error) throw error;
  await auditAutomation({ clinicId: activeClinic.id, actorId: user.id, action: "automation.run_cancelled", entityType: "automation_run", entityId: text(fd, "run_id"), metadata: { automation_id: text(fd, "automation_id") } });
  revalidatePath(`/dashboard/automacoes/${text(fd, "automation_id")}`);
}
