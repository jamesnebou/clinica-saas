"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uploadClientPhoto, uploadClinicLogo } from "@/lib/supabase/storage";
import { assertClinicLimit, assertClinicOperational } from "@/lib/saas/plans";

async function getScopedSupabase() {
  const context = await requireClinic();
  const activeClinic = context.activeClinic;
  const clinicaId = activeClinic?.id;

  if (!clinicaId) {
    throw new Error("Nenhuma clinica vinculada ao usuario logado.");
  }

  assertClinicOperational(activeClinic);

  const supabase = await createClient();
  return { supabase, clinicaId, activeClinic, memberships: context.memberships || [], user: context.user };
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

async function redirectLimitError({ clinic, resource, redirectTo }) {
  try {
    await assertClinicLimit({ clinic, resource });
  } catch (error) {
    const params = new URLSearchParams({ erro: "limite", recurso: resource, mensagem: error.message || "Limite do plano atingido." });
    redirect(`${redirectTo}?${params.toString()}`);
  }
}

const CLINIC_ROLES = new Set(["owner", "admin", "recepcao", "financeiro", "profissional"]);

function currentMembership(memberships, clinicaId) {
  return (memberships || []).find((item) => item.clinica_id === clinicaId) || memberships?.[0] || null;
}

function redirectWithMessage(path, code, message) {
  const params = new URLSearchParams({ erro: code, mensagem: message });
  redirect(`${path}?${params.toString()}`);
}

function requireClinicManager(memberships, clinicaId, redirectTo) {
  const membership = currentMembership(memberships, clinicaId);
  if (!["owner", "admin"].includes(membership?.papel)) {
    redirectWithMessage(redirectTo, "permissao", "Seu usuario nao tem permissao para administrar esta area.");
  }
}

function requireProntuarioAccess(memberships, clinicaId, redirectTo) {
  const membership = currentMembership(memberships, clinicaId);
  if (!["owner", "admin", "profissional"].includes(membership?.papel)) {
    redirectWithMessage(redirectTo, "permissao", "Prontuario restrito a owner, admin e profissional.");
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

async function findAuthUserByEmail(email) {
  let page = 1;
  const perPage = 100;

  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data?.users?.find((user) => normalizeEmail(user.email) === email);
    if (found) return found;
    if (!data?.users?.length || data.users.length < perPage) return null;
    page += 1;
  }

  return null;
}

async function upsertAuthUserWithPassword({ email, password, nome }) {
  const existing = await findAuthUserByEmail(email);

  if (existing?.id) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata || {}), nome },
    });
    if (error) throw error;
    return { user: data?.user || existing, existed: true };
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome },
  });

  if (error) throw error;
  return { user: data?.user, existed: false };
}

function safeHexColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function minutesFromTime(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function localTimeFromDate(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function assertWithinWorkingHours({ clinic, inicioRaw, fimRaw, inicio, fim, formData }) {
  const schedule = clinic?.metadata?.horario_funcionamento || {};
  const startMinutes = minutesFromTime(schedule.inicio || "08:00");
  const endMinutes = minutesFromTime(schedule.fim || "18:00");
  const activeDays = Array.isArray(schedule.dias) && schedule.dias.length ? schedule.dias.map(String) : ["1", "2", "3", "4", "5", "6"];
  const day = String(inicio.getDay());

  if (!activeDays.includes(day)) {
    redirectAgendaError(formData, "Este dia esta fora do expediente configurado da clinica.", inicioRaw.slice(0, 10));
  }

  const startsAt = localTimeFromDate(inicio);
  const endsAt = localTimeFromDate(fim);

  if (startMinutes === null || endMinutes === null || startsAt < startMinutes || endsAt > endMinutes || fimRaw.slice(0, 10) !== inicioRaw.slice(0, 10)) {
    redirectAgendaError(formData, "Este horario esta fora do expediente configurado da clinica.", inicioRaw.slice(0, 10));
  }
}

async function resolveFimByProcedimento({ supabase, clinicaId, procedimentoId, inicio }) {
  if (!procedimentoId) return null;

  const { data, error } = await supabase
    .from("procedimentos")
    .select("duracao_minutos")
    .eq("clinica_id", clinicaId)
    .eq("id", procedimentoId)
    .maybeSingle();

  if (error) throw error;
  const duration = Math.max(1, Number(data?.duracao_minutos || 60));
  return new Date(inicio.getTime() + duration * 60000);
}
export async function createClienteAction(formData) {
  const { supabase, clinicaId, activeClinic } = await getScopedSupabase();
  await redirectLimitError({ clinic: activeClinic, resource: "clientes", redirectTo: "/dashboard/clientes" });

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
  const { supabase, clinicaId, activeClinic } = await getScopedSupabase();
  await redirectLimitError({ clinic: activeClinic, resource: "profissionais", redirectTo: "/dashboard/profissionais" });

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
    sinal_percentual: Math.min(100, Math.max(0, numberValue(formData, "sinal_percentual", 0))),
    sinal_valor: Math.max(0, numberValue(formData, "sinal_valor", 0)),
    publicado_site: formData.get("publicado_site") === "on",
    destaque_site: formData.get("destaque_site") === "on",
    ordem_site: Math.max(0, numberValue(formData, "ordem_site", 0)),
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
    redirectAgendaError(formData, "Este profissional já possui atendimento nesse horario.", inicioISO.slice(0, 10));
  }
}

async function buildAgendaPayload({ supabase, formData, clinicaId, activeClinic, userId }) {
  const inicioRaw = requireValue(text(formData, "inicio"), "Informe o inicio do agendamento.");
  const procedimentoId = nullableText(formData, "procedimento_id");
  const inicio = parseDateTime(inicioRaw);

  if (!inicio) {
    redirectAgendaError(formData, "Informe uma data valida para o agendamento.");
  }

  let fimRaw = text(formData, "fim");
  let fim = fimRaw ? parseDateTime(fimRaw) : await resolveFimByProcedimento({ supabase, clinicaId, procedimentoId, inicio });

  if (!fim) {
    redirectAgendaError(formData, "Informe o fim do agendamento ou selecione um procedimento com duracao cadastrada.", inicioRaw.slice(0, 10));
  }

  if (!fimRaw) {
    const local = new Date(fim.getTime() - fim.getTimezoneOffset() * 60000);
    fimRaw = local.toISOString().slice(0, 16);
  }

  if (fim <= inicio) {
    redirectAgendaError(formData, "O horario final precisa ser maior que o horario inicial.", inicio.toISOString().slice(0, 10));
  }

  assertWithinWorkingHours({ clinic: activeClinic, inicioRaw, fimRaw, inicio, fim, formData });

  return {
    clinica_id: clinicaId,
    cliente_id: nullableText(formData, "cliente_id"),
    profissional_id: nullableText(formData, "profissional_id"),
    procedimento_id: procedimentoId,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    valor: numberValue(formData, "valor", 0),
    observacoes: nullableText(formData, "observacoes"),
    created_by: userId || null,
  };
}

export async function createAgendamentoAction(formData) {
  const { supabase, clinicaId, activeClinic } = await getScopedSupabase();
  await redirectLimitError({ clinic: activeClinic, resource: "agendamentos_mes", redirectTo: agendaRedirectUrl(formData) });
  const { data: userData } = await supabase.auth.getUser();
  const payload = await buildAgendaPayload({ supabase, formData, clinicaId, activeClinic, userId: userData?.user?.id });

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
  const { supabase, clinicaId, activeClinic } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Agendamento nao informado.");
  const payload = await buildAgendaPayload({ supabase, formData, clinicaId, activeClinic, userId: null });
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
  const { supabase, clinicaId, memberships, user } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Cliente nao informado.");
  requireProntuarioAccess(memberships, clinicaId, `/dashboard/clientes/${id}`);
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
    termo_consentimento_versao: nullableText(formData, "termo_consentimento_versao") || "v1",
    termo_consentimento_registrado_por: termoAceito ? user?.id || null : null,
  };

  const { error } = await supabase.from("clientes").update(payload).eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath(`/dashboard/clientes/${id}`);
  revalidatePath("/dashboard/clientes");
}

export async function updateClienteAnamneseAction(formData) {
  const { supabase, clinicaId, memberships } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Cliente nao informado.");
  requireProntuarioAccess(memberships, clinicaId, `/dashboard/clientes/${id}`);

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
  const { supabase, clinicaId, memberships, user } = await getScopedSupabase();
  const clienteId = requireValue(text(formData, "cliente_id"), "Cliente nao informado.");
  requireProntuarioAccess(memberships, clinicaId, `/dashboard/clientes/${clienteId}`);

  const { error } = await supabase.from("cliente_fotos").insert({
    clinica_id: clinicaId,
    cliente_id: clienteId,
    tipo: requireValue(text(formData, "tipo"), "Tipo da foto nao informado."),
    titulo: nullableText(formData, "titulo"),
    url: requireValue(text(formData, "url"), "Informe a URL da foto."),
    observacoes: nullableText(formData, "observacoes"),
    data_foto: nullableText(formData, "data_foto") || new Date().toISOString().slice(0, 10),
    autorizacao_uso_imagem: formData.get("autorizacao_uso_imagem") === "on",
    visibilidade: text(formData, "visibilidade") || "restrito",
    consentimento_id: nullableText(formData, "consentimento_id"),
    created_by: user?.id || null,
  });

  if (error) throw error;
  revalidatePath(`/dashboard/clientes/${clienteId}`);
}

export async function deleteClienteFotoAction(formData) {
  const { supabase, clinicaId, memberships } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Foto nao informada.");
  const clienteId = requireValue(text(formData, "cliente_id"), "Cliente nao informado.");
  requireProntuarioAccess(memberships, clinicaId, `/dashboard/clientes/${clienteId}`);

  const { error } = await supabase.from("cliente_fotos").delete().eq("id", id).eq("clinica_id", clinicaId).eq("cliente_id", clienteId);
  if (error) throw error;
  revalidatePath(`/dashboard/clientes/${clienteId}`);
}


function financeRedirectUrl(formData) {
  const month = text(formData, "month") || new Date().toISOString().slice(0, 7);
  return `/dashboard/financeiro?month=${encodeURIComponent(month)}`;
}

export async function createClienteFotoUploadAction(formData) {
  const { clinicaId, memberships, user } = await getScopedSupabase();
  const clienteId = requireValue(text(formData, "cliente_id"), "Cliente nao informado.");
  requireProntuarioAccess(memberships, clinicaId, `/dashboard/clientes/${clienteId}`);
  const file = formData.get("arquivo");
  const uploaded = await uploadClientPhoto({ clinicaId, clienteId, file });

  const { error } = await supabaseAdmin.from("cliente_fotos").insert({
    clinica_id: clinicaId,
    cliente_id: clienteId,
    tipo: requireValue(text(formData, "tipo"), "Tipo da foto nao informado."),
    titulo: nullableText(formData, "titulo"),
    url: null,
    storage_path: uploaded.path,
    mime_type: uploaded.mimeType,
    tamanho_bytes: uploaded.size,
    observacoes: nullableText(formData, "observacoes"),
    data_foto: nullableText(formData, "data_foto") || new Date().toISOString().slice(0, 10),
    autorizacao_uso_imagem: formData.get("autorizacao_uso_imagem") === "on",
    visibilidade: text(formData, "visibilidade") || "restrito",
    consentimento_id: nullableText(formData, "consentimento_id"),
    created_by: user?.id || null,
  });

  if (error) throw error;
  revalidatePath(`/dashboard/clientes/${clienteId}`);
}


export async function createClienteConsentimentoAction(formData) {
  const { supabase, clinicaId, memberships, user } = await getScopedSupabase();
  const clienteId = requireValue(text(formData, "cliente_id"), "Cliente nao informado.");
  requireProntuarioAccess(memberships, clinicaId, `/dashboard/clientes/${clienteId}`);

  if (formData.get("aceito") !== "on") {
    redirectWithMessage(`/dashboard/clientes/${clienteId}`, "consentimento", "Marque o aceite para registrar o consentimento.");
  }

  const payload = {
    clinica_id: clinicaId,
    cliente_id: clienteId,
    tipo: text(formData, "tipo") || "procedimento",
    titulo: requireValue(text(formData, "titulo"), "Informe o titulo do termo."),
    versao: text(formData, "versao") || "v1",
    texto: requireValue(text(formData, "texto"), "Informe o texto do termo."),
    aceito: true,
    aceito_em: new Date().toISOString(),
    aceito_por_nome: nullableText(formData, "aceito_por_nome"),
    observacoes: nullableText(formData, "observacoes"),
    created_by: user?.id || null,
  };

  const { error } = await supabase.from("cliente_consentimentos").insert(payload);
  if (error) throw error;

  if (["procedimento", "imagem", "lgpd", "anamnese"].includes(payload.tipo)) {
    await supabase
      .from("clientes")
      .update({
        termo_consentimento_aceito: true,
        termo_consentimento_aceito_em: payload.aceito_em,
        termo_consentimento_versao: payload.versao,
        termo_consentimento_registrado_por: user?.id || null,
      })
      .eq("id", clienteId)
      .eq("clinica_id", clinicaId);
  }

  revalidatePath(`/dashboard/clientes/${clienteId}`);
  redirect(`/dashboard/clientes/${clienteId}?ok=consentimento`);
}
export async function updateAgendamentoFinanceiroAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const agendamentoId = requireValue(text(formData, "agendamento_id"), "Agendamento nao informado.");
  const clienteId = nullableText(formData, "cliente_id");
  const profissionalId = nullableText(formData, "profissional_id");
  const valor = numberValue(formData, "valor", 0);
  const valorPagoInformado = numberValue(formData, "valor_pago", 0);
  const status = requireValue(text(formData, "pagamento_status"), "Status de pagamento nao informado.");
  const valorPago = status === "cancelado" ? 0 : valorPagoInformado;
  const formaPagamento = status === "cancelado" ? null : nullableText(formData, "forma_pagamento");
  const dataPagamento = status === "cancelado" ? null : nullableText(formData, "data_pagamento") || (status === "pago" ? new Date().toISOString() : null);

  const { error: agendaError } = await supabase
    .from("agendamentos")
    .update({
      valor,
      valor_pago: valorPago,
      pagamento_status: status,
      forma_pagamento: formaPagamento,
      data_pagamento: dataPagamento,
    })
    .eq("id", agendamentoId)
    .eq("clinica_id", clinicaId);

  if (agendaError) throw agendaError;

  const pagamentoPayload = {
    clinica_id: clinicaId,
    cliente_id: clienteId,
    agendamento_id: agendamentoId,
    profissional_id: profissionalId,
    descricao: nullableText(formData, "descricao") || "Pagamento de atendimento",
    valor,
    valor_pago: valorPago,
    status,
    forma_pagamento: formaPagamento,
    data_pagamento: dataPagamento,
    observacoes: nullableText(formData, "observacoes_financeiras"),
  };

  const { data: existente, error: buscaError } = await supabase
    .from("pagamentos_clinica")
    .select("id")
    .eq("clinica_id", clinicaId)
    .eq("agendamento_id", agendamentoId)
    .maybeSingle();

  if (buscaError) throw buscaError;

  const query = existente?.id
    ? supabase.from("pagamentos_clinica").update(pagamentoPayload).eq("id", existente.id)
    : supabase.from("pagamentos_clinica").insert(pagamentoPayload);

  const { error: pagamentoError } = await query;
  if (pagamentoError) throw pagamentoError;

  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard/financeiro");
  redirect(financeRedirectUrl(formData));
}

export async function createPacoteAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();

  const { error } = await supabase.from("pacotes_clinica").insert({
    clinica_id: clinicaId,
    nome: requireValue(text(formData, "nome"), "Informe o nome do pacote."),
    descricao: nullableText(formData, "descricao"),
    procedimento_id: nullableText(formData, "procedimento_id"),
    quantidade_sessoes: Math.max(1, numberValue(formData, "quantidade_sessoes", 1)),
    valor: numberValue(formData, "valor", 0),
    validade_dias: Math.max(1, numberValue(formData, "validade_dias", 90)),
  });

  if (error) throw error;
  revalidatePath("/dashboard/financeiro");
  redirect(financeRedirectUrl(formData));
}

export async function sellClientePacoteAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const pacoteId = requireValue(text(formData, "pacote_id"), "Pacote nao informado.");
  const clienteId = requireValue(text(formData, "cliente_id"), "Cliente nao informado.");

  const { data: pacote, error: pacoteError } = await supabase
    .from("pacotes_clinica")
    .select("id, nome, quantidade_sessoes, valor, validade_dias")
    .eq("clinica_id", clinicaId)
    .eq("id", pacoteId)
    .maybeSingle();

  if (pacoteError) throw pacoteError;
  if (!pacote) throw new Error("Pacote nao encontrado.");

  const compra = nullableText(formData, "data_compra") || new Date().toISOString().slice(0, 10);
  const validade = new Date(`${compra}T12:00:00`);
  validade.setDate(validade.getDate() + Number(pacote.validade_dias || 90));
  const valorPago = numberValue(formData, "valor_pago", 0);
  const status = valorPago >= Number(pacote.valor || 0) ? "pago" : valorPago > 0 ? "parcial" : "pendente";

  const { data: clientePacote, error: vendaError } = await supabase
    .from("cliente_pacotes")
    .insert({
      clinica_id: clinicaId,
      cliente_id: clienteId,
      pacote_id: pacote.id,
      nome_pacote: pacote.nome,
      sessoes_total: pacote.quantidade_sessoes,
      valor_total: pacote.valor,
      data_compra: compra,
      validade_em: validade.toISOString().slice(0, 10),
      observacoes: nullableText(formData, "observacoes"),
    })
    .select("id")
    .single();

  if (vendaError) throw vendaError;

  const { error: pagamentoError } = await supabase.from("pagamentos_clinica").insert({
    clinica_id: clinicaId,
    cliente_id: clienteId,
    descricao: `Venda de pacote: ${pacote.nome}`,
    valor: pacote.valor,
    valor_pago: valorPago,
    status,
    forma_pagamento: nullableText(formData, "forma_pagamento"),
    data_pagamento: valorPago > 0 ? new Date().toISOString() : null,
    observacoes: clientePacote?.id ? `cliente_pacote_id:${clientePacote.id}` : null,
  });

  if (pagamentoError) throw pagamentoError;
  revalidatePath("/dashboard/financeiro");
  redirect(financeRedirectUrl(formData));
}
export async function inviteClinicUserAction(formData) {
  const { supabase, clinicaId, activeClinic, memberships } = await getScopedSupabase();
  requireClinicManager(memberships, clinicaId, "/dashboard/usuarios");
  await redirectLimitError({ clinic: activeClinic, resource: "usuarios", redirectTo: "/dashboard/usuarios" });

  const email = normalizeEmail(requireValue(text(formData, "email"), "Informe o e-mail do usuario."));
  const papel = requireValue(text(formData, "papel"), "Informe o papel do usuario.");
  const senhaTemporaria = requireValue(text(formData, "senha_temporaria"), "Informe uma senha temporaria para o usuario.");

  if (!CLINIC_ROLES.has(papel)) {
    redirectWithMessage("/dashboard/usuarios", "papel", "Papel de usuario invalido.");
  }

  const authResult = await upsertAuthUserWithPassword({
    email,
    password: senhaTemporaria,
    nome: nullableText(formData, "nome") || email,
  });

  const { error } = await supabase.from("usuarios_clinica").upsert({
    clinica_id: clinicaId,
    user_id: authResult.user?.id || null,
    nome: nullableText(formData, "nome") || email,
    email,
    papel,
    ativo: true,
    invited_at: new Date().toISOString(),
    accepted_at: authResult.user?.id ? new Date().toISOString() : null,
  }, { onConflict: "clinica_id,email" });

  if (error) throw error;
  revalidatePath("/dashboard/usuarios");
  revalidatePath("/dashboard/assinatura");
  redirect(`/dashboard/usuarios?ok=${authResult.existed ? "senha" : "convite"}`);
}

export async function updateClinicUserAction(formData) {
  const { supabase, clinicaId, memberships } = await getScopedSupabase();
  requireClinicManager(memberships, clinicaId, "/dashboard/usuarios");

  const id = requireValue(text(formData, "id"), "Usuario nao informado.");
  const papel = requireValue(text(formData, "papel"), "Informe o papel do usuario.");
  const ativo = text(formData, "ativo") === "true";

  if (!CLINIC_ROLES.has(papel)) {
    redirectWithMessage("/dashboard/usuarios", "papel", "Papel de usuario invalido.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("usuarios_clinica")
    .select("id, papel, ativo")
    .eq("clinica_id", clinicaId)
    .eq("id", id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing) redirectWithMessage("/dashboard/usuarios", "usuario", "Usuario nao encontrado nesta clinica.");

  if (existing.papel === "owner" && (!ativo || papel !== "owner")) {
    const { count, error } = await supabase
      .from("usuarios_clinica")
      .select("id", { count: "exact", head: true })
      .eq("clinica_id", clinicaId)
      .eq("papel", "owner")
      .eq("ativo", true)
      .neq("id", id);

    if (error) throw error;
    if ((count || 0) === 0) {
      redirectWithMessage("/dashboard/usuarios", "owner", "Mantenha pelo menos um owner ativo na clinica.");
    }
  }

  const { error } = await supabase
    .from("usuarios_clinica")
    .update({
      nome: nullableText(formData, "nome"),
      papel,
      ativo,
    })
    .eq("clinica_id", clinicaId)
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/dashboard/usuarios");
  revalidatePath("/dashboard/assinatura");
  redirect("/dashboard/usuarios?ok=usuario");
}

function crmRedirectUrl(formData) {
  const status = text(formData, "status_filtro");
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const query = params.toString();
  return `/dashboard/crm${query ? `?${query}` : ""}`;
}

export async function createCrmOpportunityAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();

  const { error } = await supabase.from("crm_oportunidades").insert({
    clinica_id: clinicaId,
    cliente_id: nullableText(formData, "cliente_id"),
    nome: requireValue(text(formData, "nome"), "Informe o nome da oportunidade."),
    telefone: nullableText(formData, "telefone"),
    email: nullableText(formData, "email"),
    origem: text(formData, "origem") || "whatsapp",
    status: text(formData, "status") || "lead",
    valor_estimado: numberValue(formData, "valor_estimado", 0),
    proxima_acao_em: nullableText(formData, "proxima_acao_em"),
    proxima_acao: nullableText(formData, "proxima_acao"),
    observacoes: nullableText(formData, "observacoes"),
  });

  if (error) throw error;
  revalidatePath("/dashboard/crm");
  redirect("/dashboard/crm?ok=oportunidade");
}

export async function updateCrmOpportunityAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Oportunidade nao informada.");
  const status = text(formData, "status") || "lead";

  const { error } = await supabase
    .from("crm_oportunidades")
    .update({
      status,
      origem: text(formData, "origem") || "whatsapp",
      valor_estimado: numberValue(formData, "valor_estimado", 0),
      proxima_acao_em: nullableText(formData, "proxima_acao_em"),
      proxima_acao: nullableText(formData, "proxima_acao"),
      observacoes: nullableText(formData, "observacoes"),
      perdido_motivo: status === "perdido" ? nullableText(formData, "perdido_motivo") : null,
      convertido_em: status === "convertido" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("clinica_id", clinicaId);

  if (error) throw error;
  revalidatePath("/dashboard/crm");
  redirect(crmRedirectUrl(formData));
}

export async function convertCrmOpportunityAction(formData) {
  const { supabase, clinicaId, activeClinic } = await getScopedSupabase();
  await redirectLimitError({ clinic: activeClinic, resource: "clientes", redirectTo: "/dashboard/crm" });
  const id = requireValue(text(formData, "id"), "Oportunidade nao informada.");

  const { data: oportunidade, error: opportunityError } = await supabase
    .from("crm_oportunidades")
    .select("id, cliente_id, nome, telefone, email, origem, observacoes")
    .eq("id", id)
    .eq("clinica_id", clinicaId)
    .maybeSingle();

  if (opportunityError) throw opportunityError;
  if (!oportunidade) redirectWithMessage("/dashboard/crm", "crm", "Oportunidade nao encontrada.");

  let clienteId = oportunidade.cliente_id;

  if (!clienteId) {
    let existingQuery = supabase.from("clientes").select("id").eq("clinica_id", clinicaId).limit(1);
    if (oportunidade.email) {
      existingQuery = existingQuery.eq("email", oportunidade.email);
    } else if (oportunidade.telefone) {
      existingQuery = existingQuery.eq("telefone", oportunidade.telefone);
    } else {
      existingQuery = existingQuery.eq("nome", oportunidade.nome);
    }

    const { data: existingClientes, error: existingError } = await existingQuery;
    if (existingError) throw existingError;
    clienteId = existingClientes?.[0]?.id || null;

    if (!clienteId) {
      const phone = normalizePhone(oportunidade.telefone);
      const { data: cliente, error: clienteError } = await supabase
        .from("clientes")
        .insert({
          clinica_id: clinicaId,
          nome: oportunidade.nome,
          telefone: oportunidade.telefone,
          email: oportunidade.email,
          origem: oportunidade.origem,
          status: "ativo",
          observacoes: oportunidade.observacoes || `Convertido pelo CRM. Telefone normalizado: ${phone || "-"}.`,
          consentimento_lgpd: false,
        })
        .select("id")
        .single();

      if (clienteError) throw clienteError;
      clienteId = cliente.id;
    }
  }

  const { error } = await supabase
    .from("crm_oportunidades")
    .update({
      cliente_id: clienteId,
      status: "convertido",
      convertido_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("clinica_id", clinicaId);

  if (error) throw error;
  revalidatePath("/dashboard/crm");
  revalidatePath("/dashboard/clientes");
  redirect(`/dashboard/clientes/${clienteId}`);
}

export async function updateClinicSettingsAction(formData) {
  const { supabase, clinicaId, activeClinic, memberships } = await getScopedSupabase();
  requireClinicManager(memberships, clinicaId, "/dashboard/configuracoes");

  const metadata = activeClinic.metadata || {};
  const dias = formData.getAll("dias_funcionamento").map((item) => String(item));
  const logoFile = formData.get("logo_file");
  let uploadedLogo = null;

  try {
    uploadedLogo = await uploadClinicLogo({ clinicaId, file: logoFile });
  } catch (error) {
    redirectWithMessage("/dashboard/configuracoes", "logo", error.message || "Nao foi possivel enviar a logo.");
  }

  const nextMetadata = {
    ...metadata,
    brand_name: nullableText(formData, "brand_name") || requireValue(text(formData, "nome"), "Informe o nome da clinica."),
    logo_url: uploadedLogo?.publicUrl || metadata.logo_url || "",
    logo_storage_path: uploadedLogo?.path || metadata.logo_storage_path || null,
    logo_mime_type: uploadedLogo?.mimeType || metadata.logo_mime_type || null,
    logo_tamanho_bytes: uploadedLogo?.size || metadata.logo_tamanho_bytes || null,
    primary_color: safeHexColor(text(formData, "primary_color"), metadata.primary_color || "#047857"),
    accent_color: safeHexColor(text(formData, "accent_color"), metadata.accent_color || "#10b981"),
    horario_funcionamento: {
      inicio: text(formData, "expediente_inicio") || "08:00",
      fim: text(formData, "expediente_fim") || "18:00",
      dias: dias.length ? dias : ["1", "2", "3", "4", "5", "6"],
    },
    politica_cancelamento: nullableText(formData, "politica_cancelamento"),
    whatsapp_mensagem_padrao: nullableText(formData, "whatsapp_mensagem_padrao"),
    site_publico: {
      ...(metadata.site_publico || {}),
      publicado: formData.get("site_publicado") === "on",
      eyebrow: nullableText(formData, "site_eyebrow"),
      titulo_hero: nullableText(formData, "site_titulo_hero"),
      subtitulo_hero: nullableText(formData, "site_subtitulo_hero"),
      nome_profissional: nullableText(formData, "site_nome_profissional"),
      bio_profissional: nullableText(formData, "site_bio_profissional"),
      credencial_1: nullableText(formData, "site_credencial_1"),
      credencial_2: nullableText(formData, "site_credencial_2"),
      credencial_3: nullableText(formData, "site_credencial_3"),
    },
  };

  const dominio = nullableText(formData, "site_dominio");

  const { error } = await supabase
    .from("clinicas")
    .update({
      nome: requireValue(text(formData, "nome"), "Informe o nome da clinica."),
      documento: nullableText(formData, "documento"),
      telefone: nullableText(formData, "telefone"),
      email: nullableText(formData, "email"),
      endereco: nullableText(formData, "endereco"),
      cidade: nullableText(formData, "cidade"),
      estado: nullableText(formData, "estado"),
      metadata: nextMetadata,
    })
    .eq("id", clinicaId);

  if (error) throw error;

  if (dominio) {
    const normalizedDomain = dominio.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
    const { error: domainError } = await supabase.from("clinica_dominios").upsert({
      clinica_id: clinicaId,
      dominio: normalizedDomain,
      status: "pendente",
      observacoes: "Aguardando apontamento DNS e configuracao na Vercel.",
    }, { onConflict: "dominio" });

    if (domainError) throw domainError;
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/configuracoes");
  revalidatePath(`/c/${activeClinic.slug}`);
  redirect("/dashboard/configuracoes?ok=configuracoes");
}




