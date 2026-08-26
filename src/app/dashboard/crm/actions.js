"use server";

import { revalidatePath } from "next/cache";
import { requireClinicSection } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { normalizeCrmEmail, normalizeCrmPhone } from "@/lib/crm/core.mjs";

const text = (fd, key) => String(fd.get(key) || "").trim();
const nullable = (fd, key) => text(fd, key) || null;
const numeric = (fd, key, fallback = 0) => Number(fd.get(key) ?? fallback);
async function scope() { const context = await requireClinicSection("crm"); return { supabase: await createClient(), clinicId: context.activeClinic.id }; }
function refresh() { revalidatePath("/dashboard/crm"); revalidatePath("/dashboard/crm/configuracoes"); revalidatePath("/dashboard/bi"); }

async function findOrCreateContact(supabase, clinicId, fd) {
  const email = normalizeCrmEmail(text(fd, "email"));
  const phone = normalizeCrmPhone(text(fd, "telefone"));
  if (!email && !phone) return null;
  let query = supabase.from("clientes").select("id").eq("clinica_id", clinicId).limit(1);
  query = email ? query.ilike("email", email) : query.or(`telefone.eq.${phone},telefone.eq.${phone.replace(/^55/, "")}`);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (data?.id) return data.id;
  const { data: created, error: createError } = await supabase.from("clientes").insert({ clinica_id: clinicId, nome: text(fd, "nome"), email: email || null, telefone: phone || null, origem: text(fd, "origem") || "CRM", status: "lead" }).select("id").single();
  if (createError) throw createError;
  return created.id;
}

export async function createCrmOpportunityAction(fd) {
  const { supabase, clinicId } = await scope();
  const contactId = nullable(fd, "cliente_id") || await findOrCreateContact(supabase, clinicId, fd);
  const { data, error } = await supabase.rpc("crm_create_opportunity", {
    p_clinica_id: clinicId, p_cliente_id: contactId, p_nome: text(fd, "nome"), p_titulo: text(fd, "titulo") || "Nova oportunidade",
    p_telefone: normalizeCrmPhone(text(fd, "telefone")) || null, p_email: normalizeCrmEmail(text(fd, "email")) || null,
    p_origem: text(fd, "origem") || "outro", p_valor: numeric(fd, "valor_estimado"), p_pipeline_id: nullable(fd, "pipeline_id"),
    p_stage_id: nullable(fd, "stage_id"), p_procedimento_id: nullable(fd, "procedimento_id"), p_responsavel_id: nullable(fd, "responsavel_id"),
    p_temperatura: text(fd, "temperatura") || "morno", p_score: numeric(fd, "score", 50), p_observacoes: nullable(fd, "observacoes"),
    p_attribution: {}, p_identificador_externo: null,
  });
  if (error) throw new Error(error.message);
  refresh(); return { ok: true, opportunity: data };
}

export async function moveCrmOpportunityAction(input) {
  const { supabase, clinicId } = await scope();
  const payload = input instanceof FormData ? { opportunityId: text(input, "opportunity_id"), stageId: text(input, "stage_id"), lostReasonId: nullable(input, "lost_reason_id"), closedValue: nullable(input, "valor_fechado") } : input;
  const { data, error } = await supabase.rpc("crm_move_opportunity", {
    p_clinica_id: clinicId, p_opportunity_id: payload.opportunityId, p_stage_id: payload.stageId,
    p_before_id: payload.beforeId || null, p_after_id: payload.afterId || null, p_lost_reason_id: payload.lostReasonId || null,
    p_closed_value: payload.closedValue === null || payload.closedValue === undefined || payload.closedValue === "" ? null : Number(payload.closedValue),
  });
  if (error) return { ok: false, error: error.message };
  refresh(); return { ok: true, opportunity: data };
}

export async function updateCrmOpportunityAction(fd) {
  const { supabase, clinicId } = await scope();
  const { data, error } = await supabase.rpc("crm_save_opportunity", {
    p_clinica_id: clinicId, p_opportunity_id: text(fd, "opportunity_id"), p_titulo: text(fd, "titulo"),
    p_valor: numeric(fd, "valor_estimado"), p_responsavel_id: nullable(fd, "responsavel_id"), p_temperatura: text(fd, "temperatura") || "morno",
    p_score: numeric(fd, "score", 50), p_observacoes: nullable(fd, "observacoes"), p_procedimento_id: nullable(fd, "procedimento_id"),
  });
  if (error) throw new Error(error.message);
  refresh(); return { ok: true, opportunity: data };
}

export async function createCrmActivityAction(fd) {
  const { supabase, clinicId } = await scope();
  const { data, error } = await supabase.rpc("crm_create_activity", { p_clinica_id: clinicId, p_opportunity_id: text(fd, "opportunity_id"), p_tipo: text(fd, "tipo") || "follow_up", p_titulo: text(fd, "titulo"), p_descricao: nullable(fd, "descricao"), p_due_at: nullable(fd, "due_at"), p_owner_id: nullable(fd, "owner_id") });
  if (error) throw new Error(error.message);
  refresh(); return { ok: true, activity: data };
}

export async function completeCrmActivityAction(fd) {
  const { supabase, clinicId } = await scope();
  const { error } = await supabase.rpc("crm_complete_activity", { p_clinica_id: clinicId, p_activity_id: text(fd, "activity_id") });
  if (error) throw new Error(error.message); refresh();
}

export async function createPipelineStageAction(fd) {
  const { supabase, clinicId } = await scope();
  const name = text(fd, "nome");
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const { data: last } = await supabase.from("crm_pipeline_stages").select("ordem").eq("clinica_id", clinicId).eq("pipeline_id", text(fd, "pipeline_id")).order("ordem", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("crm_pipeline_stages").insert({ clinica_id: clinicId, pipeline_id: text(fd, "pipeline_id"), nome: name, slug, ordem: Number(last?.ordem || 0) + 10, cor: text(fd, "cor") || "#64748b", probabilidade: numeric(fd, "probabilidade"), tipo: text(fd, "tipo") || "open", semantic_key: nullable(fd, "semantic_key") });
  if (error) throw new Error(error.message); refresh();
}

export async function updatePipelineStageAction(fd) {
  const { supabase, clinicId } = await scope();
  const { error } = await supabase.from("crm_pipeline_stages").update({ nome: text(fd, "nome"), cor: text(fd, "cor"), probabilidade: numeric(fd, "probabilidade"), tipo: text(fd, "tipo"), semantic_key: nullable(fd, "semantic_key") }).eq("clinica_id", clinicId).eq("id", text(fd, "stage_id"));
  if (error) throw new Error(error.message); refresh();
}

export async function reorderPipelineStagesAction(stageIds, pipelineId) {
  const { supabase, clinicId } = await scope();
  const { error } = await supabase.rpc("crm_reorder_stages", { p_clinica_id: clinicId, p_pipeline_id: pipelineId, p_stage_ids: stageIds });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function createLostReasonAction(fd) { const { supabase, clinicId } = await scope(); const { error } = await supabase.from("crm_lost_reasons").insert({ clinica_id: clinicId, nome: text(fd, "nome"), ordem: numeric(fd, "ordem") }); if (error) throw new Error(error.message); refresh(); }
export async function createCrmTagAction(fd) { const { supabase, clinicId } = await scope(); const { error } = await supabase.from("crm_tags").insert({ clinica_id: clinicId, nome: text(fd, "nome"), cor: text(fd, "cor") || "#64748b" }); if (error) throw new Error(error.message); refresh(); }
export async function updateProcedureCrmBehaviorAction(fd) { const { supabase, clinicId } = await scope(); const { error } = await supabase.from("procedimentos").update({ crm_booking_behavior: text(fd, "crm_booking_behavior") || "none" }).eq("clinica_id", clinicId).eq("id", text(fd, "procedimento_id")); if (error) throw new Error(error.message); refresh(); }
