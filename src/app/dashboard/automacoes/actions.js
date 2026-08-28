"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClinicSection } from "@/lib/auth/session";
import { getAutomationTemplate } from "@/lib/automations/templates.mjs";
import { normalizeDefinition } from "@/lib/automations/core.mjs";
import { validateAutomationDefinition } from "@/lib/automations/validation.mjs";

function text(fd, key) { return String(fd.get(key) || "").trim(); }

export async function createAutomationAction(fd) {
  const { activeClinic, user, supabase } = await requireClinicSection("automacoes");
  const template = getAutomationTemplate(text(fd, "template_id"));
  const definition = template ? template.definition : { schemaVersion: 1, trigger: { type: "crm.opportunity.created", reentry: "deny_self" }, conditions: { kind: "group", operator: "AND", conditions: [] }, steps: [{ id: "notify", type: "action", actionType: "internal.create_notification", params: { title: "Nova oportunidade", message: "Revise esta oportunidade." } }] };
  const { data, error } = await supabase.from("automations").insert({ clinica_id: activeClinic.id, name: text(fd, "name") || template?.name || "Nova automação", description: template?.description || null, status: "draft", trigger_type: definition.trigger.type, draft_definition: definition, owner_id: user.id, metadata: template ? { template_id: template.id } : {} }).select("id").single();
  if (error) throw error;
  redirect(`/dashboard/automacoes/${data.id}`);
}

export async function saveAutomationDraftAction(fd) {
  const { activeClinic, supabase } = await requireClinicSection("automacoes");
  const id = text(fd, "automation_id");
  const validation = validateAutomationDefinition(text(fd, "definition_json"));
  if (!validation.definition) redirect(`/dashboard/automacoes/${id}?error=definition`);
  const { error } = await supabase.from("automations").update({ name: text(fd, "name"), description: text(fd, "description") || null, trigger_type: validation.definition.trigger.type, draft_definition: validation.definition, status: text(fd, "current_status") === "active" ? "active" : "draft", updated_at: new Date().toISOString() }).eq("clinica_id", activeClinic.id).eq("id", id);
  if (error) throw error;
  revalidatePath(`/dashboard/automacoes/${id}`);
  redirect(`/dashboard/automacoes/${id}?saved=1${validation.valid ? "" : "&warning=invalid"}`);
}

export async function publishAutomationAction(fd) {
  const { activeClinic, user, supabase } = await requireClinicSection("automacoes");
  const id = text(fd, "automation_id");
  const { data: automation, error: readError } = await supabase.from("automations").select("draft_definition").eq("clinica_id", activeClinic.id).eq("id", id).single();
  if (readError) throw readError;
  const validation = validateAutomationDefinition(automation.draft_definition);
  if (!validation.valid) redirect(`/dashboard/automacoes/${id}?error=publish&details=${encodeURIComponent(validation.errors.slice(0, 3).join(" | "))}`);
  const json = JSON.stringify(validation.definition);
  const hash = createHash("sha256").update(json).digest("hex");
  const { error } = await supabase.rpc("publish_automation_v2", { p_clinica_id: activeClinic.id, p_automation_id: id, p_definition: validation.definition, p_trigger_type: validation.definition.trigger.type, p_definition_hash: hash, p_actor_id: user.id });
  if (error) throw error;
  revalidatePath("/dashboard/automacoes");
  redirect(`/dashboard/automacoes/${id}?published=1`);
}

export async function setAutomationStatusAction(fd) {
  const { activeClinic, supabase } = await requireClinicSection("automacoes");
  const id = text(fd, "automation_id");
  const status = ["active", "paused", "archived"].includes(text(fd, "status")) ? text(fd, "status") : "paused";
  const { error } = await supabase.from("automations").update({ status, updated_at: new Date().toISOString() }).eq("clinica_id", activeClinic.id).eq("id", id);
  if (error) throw error;
  revalidatePath("/dashboard/automacoes");
}

export async function cancelAutomationRunAction(fd) {
  const { activeClinic, supabase } = await requireClinicSection("automacoes");
  const { error } = await supabase.rpc("cancel_automation_run", { p_clinica_id: activeClinic.id, p_run_id: text(fd, "run_id") });
  if (error) throw error;
  revalidatePath(`/dashboard/automacoes/${text(fd, "automation_id")}`);
}
