"use server";

import { revalidatePath } from "next/cache";
import { requireClinicSection } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/permissions";

const GOAL_TYPES = new Set(["receita", "atendimentos", "conversao", "ticket_medio", "ocupacao", "no_show"]);

function text(formData, key) { return String(formData.get(key) || "").trim(); }

export async function createBIGoalAction(formData) {
  const { activeClinic, memberships, user } = await requireClinicSection("bi");
  if (!activeClinic) throw new Error("Clínica não encontrada.");
  const membership = getCurrentMembership(memberships, activeClinic.id);
  if (!["owner", "admin"].includes(membership?.papel)) throw new Error("Somente owner ou admin pode gerenciar metas.");
  const tipo = text(formData, "tipo");
  const inicio = text(formData, "periodo_inicio");
  const fim = text(formData, "periodo_fim");
  const valorMeta = Number(text(formData, "valor_meta").replace(",", "."));
  const profissionalId = text(formData, "profissional_id") || null;
  if (!GOAL_TYPES.has(tipo)) throw new Error("Tipo de meta inválido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || fim < inicio) throw new Error("Período da meta inválido.");
  if (!Number.isFinite(valorMeta) || valorMeta < 0) throw new Error("Valor da meta inválido.");
  const supabase = await createClient();
  const { data: goal, error } = await supabase.from("metas_clinica").insert({ clinica_id: activeClinic.id, tipo, referencia: text(formData, "referencia") || null, periodo_inicio: inicio, periodo_fim: fim, valor_meta: valorMeta, profissional_id: profissionalId }).select("id").single();
  if (error) throw new Error(error.message);
  const { error: auditError } = await supabase.from("auditoria_clinica").insert({ clinica_id: activeClinic.id, actor_id: user.id, acao: "bi.meta_criada", entidade_tipo: "meta", entidade_id: goal.id, metadata: { tipo, periodo_inicio: inicio, periodo_fim: fim } });
  if (auditError) console.error("Erro ao auditar criação de meta:", auditError.message);
  revalidatePath("/dashboard/bi");
}

export async function deleteBIGoalAction(formData) {
  const { activeClinic, memberships, user } = await requireClinicSection("bi");
  const id = text(formData, "id");
  if (!activeClinic || !id) throw new Error("Meta inválida.");
  const membership = getCurrentMembership(memberships, activeClinic.id);
  if (!["owner", "admin"].includes(membership?.papel)) throw new Error("Somente owner ou admin pode gerenciar metas.");
  const supabase = await createClient();
  const { error } = await supabase.from("metas_clinica").delete().eq("id", id).eq("clinica_id", activeClinic.id);
  if (error) throw new Error(error.message);
  const { error: auditError } = await supabase.from("auditoria_clinica").insert({ clinica_id: activeClinic.id, actor_id: user.id, acao: "bi.meta_excluida", entidade_tipo: "meta", entidade_id: id });
  if (auditError) console.error("Erro ao auditar exclusão de meta:", auditError.message);
  revalidatePath("/dashboard/bi");
}
