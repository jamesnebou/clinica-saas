"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

function agendaRedirectUrl(formData, fallbackDate = "") {
  const date = text(formData, "agenda_date") || fallbackDate || new Date().toISOString().slice(0, 10);
  const profissionalId = text(formData, "profissional_filtro");
  const params = new URLSearchParams({ date });

  if (profissionalId) params.set("profissional", profissionalId);
  return `/dashboard/agenda?${params.toString()}`;
}

function redirectAgendaError(formData, message, fallbackDate = "") {
  const url = agendaRedirectUrl(formData, fallbackDate);
  const separator = url.includes("?") ? "&" : "?";
  redirect(`${url}${separator}error=${encodeURIComponent(message)}`);
}

function parseDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function assertHorarioDisponivel({ supabase, clinicaId, profissionalId, inicioISO, fimISO, ignoreId = "", formData }) {
  if (!profissionalId) return;

  let query = supabase
    .from("agendamentos")
    .select("id")
    .eq("clinica_id", clinicaId)
    .eq("profissional_id", profissionalId)
    .not("status", "eq", "cancelado")
    .lt("inicio", fimISO)
    .gt("fim", inicioISO)
    .limit(1);

  if (ignoreId) {
    query = query.neq("id", ignoreId);
  }

  const { data, error } = await query;

  if (error) throw error;

  if (data?.length) {
    redirectAgendaError(formData, "Este profissional já possui atendimento nesse horário.", inicioISO.slice(0, 10));
  }
}

function buildAgendaPayload({ formData, clinicaId, userId }) {
  const inicioRaw = requireValue(text(formData, "inicio"), "Informe o inicio do agendamento.");
  const fimRaw = requireValue(text(formData, "fim"), "Informe o fim do agendamento.");
  const inicio = parseDateTime(inicioRaw);
  const fim = parseDateTime(fimRaw);

  if (!inicio || !fim) {
    redirectAgendaError(formData, "Informe datas válidas para o agendamento.");
  }

  if (fim <= inicio) {
    redirectAgendaError(formData, "O horário final precisa ser maior que o horário inicial.", inicio.toISOString().slice(0, 10));
  }

  return {
    clinica_id: clinicaId,
    cliente_id: nullableText(formData, "cliente_id"),
    profissional_id: nullableText(formData, "profissional_id"),
    procedimento_id: nullableText(formData, "procedimento_id"),
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    valor: numberValue(formData, "valor", 0),
    observacoes: nullableText(formData, "observacoes"),
    created_by: userId || null,
  };
}

export async function createAgendamentoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const payload = buildAgendaPayload({ formData, clinicaId, userId: userData?.user?.id });

  await assertHorarioDisponivel({
    supabase,
    clinicaId,
    profissionalId: payload.profissional_id,
    inicioISO: payload.inicio,
    fimISO: payload.fim,
    formData,
  });

  const { error } = await supabase.from("agendamentos").insert({
    ...payload,
    status: "agendado",
  });

  if (error) throw error;
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard");
  redirect(agendaRedirectUrl(formData, payload.inicio.slice(0, 10)));
}

export async function updateAgendamentoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Agendamento nao informado.");
  const payload = buildAgendaPayload({ formData, clinicaId, userId: null });
  const status = requireValue(text(formData, "status"), "Status nao informado.");

  await assertHorarioDisponivel({
    supabase,
    clinicaId,
    profissionalId: payload.profissional_id,
    inicioISO: payload.inicio,
    fimISO: payload.fim,
    ignoreId: id,
    formData,
  });

  const { error } = await supabase
    .from("agendamentos")
    .update({
      cliente_id: payload.cliente_id,
      profissional_id: payload.profissional_id,
      procedimento_id: payload.procedimento_id,
      inicio: payload.inicio,
      fim: payload.fim,
      valor: payload.valor,
      observacoes: payload.observacoes,
      status,
    })
    .eq("id", id)
    .eq("clinica_id", clinicaId);

  if (error) throw error;
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard");
  redirect(agendaRedirectUrl(formData, payload.inicio.slice(0, 10)));
}

export async function updateAgendamentoStatusAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Agendamento nao informado.");
  const status = requireValue(text(formData, "status"), "Status nao informado.");

  const { error } = await supabase.from("agendamentos").update({ status }).eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard");
  redirect(agendaRedirectUrl(formData));
}

export async function deleteAgendamentoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Agendamento nao informado.");

  const { error } = await supabase.from("agendamentos").delete().eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard");
  redirect(agendaRedirectUrl(formData));
}

export async function updateClienteFichaAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Cliente nao informado.");
  const termoAceito = formData.get("termo_consentimento_aceito") === "on";

  const payload = {
    nome: requireValue(text(formData, "nome"), "Informe o nome do cliente."),
    telefone: nullableText(formData, "telefone"),
    email: nullableText(formData, "email"),
    cpf: nullableText(formData, "cpf"),
    data_nascimento: nullableText(formData, "data_nascimento"),
    endereco: nullableText(formData, "endereco"),
    origem: nullableText(formData, "origem"),
    status: requireValue(text(formData, "status"), "Status nao informado."),
    observacoes: nullableText(formData, "observacoes"),
    observacoes_clinicas: nullableText(formData, "observacoes_clinicas"),
    alergias: nullableText(formData, "alergias"),
    contraindicacoes: nullableText(formData, "contraindicacoes"),
    medicamentos_uso: nullableText(formData, "medicamentos_uso"),
    procedimentos_previos: nullableText(formData, "procedimentos_previos"),
    retorno_recomendado_em: nullableText(formData, "retorno_recomendado_em"),
    termo_consentimento_aceito: termoAceito,
    termo_consentimento_aceito_em: termoAceito ? (nullableText(formData, "termo_consentimento_aceito_em") || new Date().toISOString()) : null,
    termo_consentimento_observacao: nullableText(formData, "termo_consentimento_observacao"),
  };

  const { error } = await supabase.from("clientes").update(payload).eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath(`/dashboard/clientes/${id}`);
  revalidatePath("/dashboard/clientes");
}

export async function updateClienteAnamneseAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Cliente nao informado.");

  const anamnese = {
    objetivo_principal: nullableText(formData, "objetivo_principal"),
    queixa_principal: nullableText(formData, "queixa_principal"),
    gestante: formData.get("gestante") === "on",
    lactante: formData.get("lactante") === "on",
    diabetes: formData.get("diabetes") === "on",
    hipertensao: formData.get("hipertensao") === "on",
    marcapasso: formData.get("marcapasso") === "on",
    cancer_tratamento: formData.get("cancer_tratamento") === "on",
    tendencia_queloide: formData.get("tendencia_queloide") === "on",
    usa_acidos: formData.get("usa_acidos") === "on",
    exposicao_solar: nullableText(formData, "exposicao_solar"),
    rotina_skincare: nullableText(formData, "rotina_skincare"),
    observacoes: nullableText(formData, "anamnese_observacoes"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("clientes").update({ anamnese }).eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath(`/dashboard/clientes/${id}`);
}

export async function createClienteFotoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const clienteId = requireValue(text(formData, "cliente_id"), "Cliente nao informado.");

  const { error } = await supabase.from("cliente_fotos").insert({
    clinica_id: clinicaId,
    cliente_id: clienteId,
    tipo: requireValue(text(formData, "tipo"), "Tipo da foto nao informado."),
    titulo: nullableText(formData, "titulo"),
    url: requireValue(text(formData, "url"), "Informe a URL da foto."),
    observacoes: nullableText(formData, "observacoes"),
    data_foto: nullableText(formData, "data_foto") || new Date().toISOString().slice(0, 10),
  });

  if (error) throw error;
  revalidatePath(`/dashboard/clientes/${clienteId}`);
}

export async function deleteClienteFotoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Foto nao informada.");
  const clienteId = requireValue(text(formData, "cliente_id"), "Cliente nao informado.");

  const { error } = await supabase.from("cliente_fotos").delete().eq("id", id).eq("clinica_id", clinicaId).eq("cliente_id", clienteId);
  if (error) throw error;
  revalidatePath(`/dashboard/clientes/${clienteId}`);
}
