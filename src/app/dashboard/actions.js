"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/auth/session";

async function getScopedSupabase() {
  const context = await requireClinic();
  const clinicaId = context.activeClinic?.id;

  if (!clinicaId) {
    throw new Error("Nenhuma clinica vinculada ao usuario logado.");
  }

  const supabase = await createClient();
  return { supabase, clinicaId };
}

function text(formData, key) {
  return String(formData.get(key) || "").trim();
}

function nullableText(formData, key) {
  const value = text(formData, key);
  return value || null;
}

function numberValue(formData, key, fallback = 0) {
  const value = Number(String(formData.get(key) || "").replace(",", "."));
  return Number.isFinite(value) ? value : fallback;
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

export async function createClienteAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();

  const payload = {
    clinica_id: clinicaId,
    nome: requireValue(text(formData, "nome"), "Informe o nome do cliente."),
    telefone: nullableText(formData, "telefone"),
    email: nullableText(formData, "email"),
    cpf: nullableText(formData, "cpf"),
    data_nascimento: nullableText(formData, "data_nascimento"),
    origem: nullableText(formData, "origem"),
    observacoes: nullableText(formData, "observacoes"),
    consentimento_lgpd: formData.get("consentimento_lgpd") === "on",
    data_consentimento_lgpd: formData.get("consentimento_lgpd") === "on" ? new Date().toISOString() : null,
  };

  const { error } = await supabase.from("clientes").insert(payload);
  if (error) throw error;
  revalidatePath("/dashboard/clientes");
  revalidatePath("/dashboard");
}

export async function updateClienteStatusAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Cliente nao informado.");
  const status = requireValue(text(formData, "status"), "Status nao informado.");

  const { error } = await supabase.from("clientes").update({ status }).eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/clientes");
  revalidatePath("/dashboard");
}

export async function deleteClienteAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Cliente nao informado.");

  const { error } = await supabase.from("clientes").delete().eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/clientes");
  revalidatePath("/dashboard");
}

export async function createProfissionalAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();

  const { error } = await supabase.from("profissionais").insert({
    clinica_id: clinicaId,
    nome: requireValue(text(formData, "nome"), "Informe o nome do profissional."),
    telefone: nullableText(formData, "telefone"),
    email: nullableText(formData, "email"),
    especialidade: nullableText(formData, "especialidade"),
    comissao_percentual: numberValue(formData, "comissao_percentual", 0),
    observacoes: nullableText(formData, "observacoes"),
  });

  if (error) throw error;
  revalidatePath("/dashboard/profissionais");
  revalidatePath("/dashboard");
}

export async function toggleProfissionalAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Profissional nao informado.");
  const ativo = text(formData, "ativo") === "true";

  const { error } = await supabase.from("profissionais").update({ ativo }).eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/profissionais");
}

export async function deleteProfissionalAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Profissional nao informado.");

  const { error } = await supabase.from("profissionais").delete().eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/profissionais");
}

export async function createProcedimentoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();

  const { error } = await supabase.from("procedimentos").insert({
    clinica_id: clinicaId,
    nome: requireValue(text(formData, "nome"), "Informe o nome do procedimento."),
    categoria: nullableText(formData, "categoria"),
    descricao: nullableText(formData, "descricao"),
    duracao_minutos: Math.max(1, numberValue(formData, "duracao_minutos", 60)),
    preco: numberValue(formData, "preco", 0),
    cuidados_antes: nullableText(formData, "cuidados_antes"),
    cuidados_depois: nullableText(formData, "cuidados_depois"),
  });

  if (error) throw error;
  revalidatePath("/dashboard/procedimentos");
  revalidatePath("/dashboard");
}

export async function toggleProcedimentoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Procedimento nao informado.");
  const ativo = text(formData, "ativo") === "true";

  const { error } = await supabase.from("procedimentos").update({ ativo }).eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/procedimentos");
}

export async function deleteProcedimentoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Procedimento nao informado.");

  const { error } = await supabase.from("procedimentos").delete().eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/procedimentos");
}

export async function createAgendamentoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const inicio = requireValue(text(formData, "inicio"), "Informe o inicio do agendamento.");
  const fim = requireValue(text(formData, "fim"), "Informe o fim do agendamento.");

  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase.from("agendamentos").insert({
    clinica_id: clinicaId,
    cliente_id: nullableText(formData, "cliente_id"),
    profissional_id: nullableText(formData, "profissional_id"),
    procedimento_id: nullableText(formData, "procedimento_id"),
    inicio: new Date(inicio).toISOString(),
    fim: new Date(fim).toISOString(),
    status: "agendado",
    valor: numberValue(formData, "valor", 0),
    observacoes: nullableText(formData, "observacoes"),
    created_by: userData?.user?.id || null,
  });

  if (error) throw error;
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard");
}

export async function updateAgendamentoStatusAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Agendamento nao informado.");
  const status = requireValue(text(formData, "status"), "Status nao informado.");

  const { error } = await supabase.from("agendamentos").update({ status }).eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard");
}

export async function deleteAgendamentoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Agendamento nao informado.");

  const { error } = await supabase.from("agendamentos").delete().eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard");
}
