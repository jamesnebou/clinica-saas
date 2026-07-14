"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uploadClientPhoto, uploadClinicLogo, uploadClinicSiteImage, uploadProcedureImage, uploadProductImage } from "@/lib/supabase/storage";
import { assertClinicLimit, assertClinicOperational } from "@/lib/saas/plans";
import { ensureVercelProjectDomain, getVercelProjectDomain, normalizeCustomDomain, removeVercelProjectDomain } from "@/lib/vercel/domains";
import { sendWhatsAppIntegrationTest } from "@/lib/notifications/booking";
import { buildScheduleFromForm, isWithinWorkingPeriods } from "@/lib/clinic/schedule";
import { ACCESS_SECTIONS } from "@/lib/auth/permissions";
import { decryptClinicSecrets, encryptClinicSecrets } from "@/lib/security/clinic-secrets";
import { getAsaasBaseUrl, removeAsaasWebhook, upsertAsaasWebhook, validateAsaasConnection } from "@/lib/asaas/client";

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
const ACCESS_SECTION_SET = new Set(ACCESS_SECTIONS);

function currentMembership(memberships, clinicaId) {
  return (memberships || []).find((item) => item.clinica_id === clinicaId) || memberships?.[0] || null;
}

function redirectWithMessage(path, code, message) {
  const params = new URLSearchParams({ erro: code, mensagem: message });
  redirect(`${path}?${params.toString()}`);
}

function userRedirectPath(formData, fallback = "/dashboard/usuarios") {
  const redirectTo = text(formData, "redirect_to");
  return redirectTo.startsWith("/dashboard") ? redirectTo : fallback;
}

function permissionsFromForm(formData, papel) {
  if (papel === "owner") return { secoes: [] };

  const selectedSections = formData
    .getAll("secoes_permitidas")
    .map((value) => String(value || "").trim())
    .filter((section) => ACCESS_SECTION_SET.has(section));

  return { secoes: Array.from(new Set(selectedSections)) };
}

function vercelDomainObservacoes(vercelDomain) {
  return JSON.stringify({
    provider: "vercel",
    configured: Boolean(vercelDomain.configured),
    ok: Boolean(vercelDomain.ok),
    missing: Boolean(vercelDomain.missing),
    verified: Boolean(vercelDomain.verified),
    message: vercelDomain.message || null,
    verification: vercelDomain.payload?.verification || null,
    updated_at: new Date().toISOString(),
  });
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

function normalizeProvider(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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

function assertWithinWorkingHours({ clinic, inicioRaw, fimRaw, inicio, fim, formData }) {
  const schedule = clinic?.metadata?.horario_funcionamento || {};

  if (!isWithinWorkingPeriods({ schedule, startDate: inicio, endDate: fim }) || fimRaw.slice(0, 10) !== inicioRaw.slice(0, 10)) {
    redirectAgendaError(formData, "Este horário está fora do expediente configurado da clínica.", inicioRaw.slice(0, 10));
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
  const id = requireValue(text(formData, "id"), "Cliente não informado.");
  const status = requireValue(text(formData, "status"), "Status não informado.");

  const { error } = await supabase.from("clientes").update({ status }).eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/clientes");
  revalidatePath("/dashboard");
}

export async function deleteClienteAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Cliente não informado.");

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
  const uploadedImage = await uploadProcedureImage({ clinicaId, file: formData.get("imagem_file") });

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
    imagem_url: uploadedImage?.publicUrl || null,
    imagem_storage_path: uploadedImage?.path || null,
    imagem_mime_type: uploadedImage?.mimeType || null,
    imagem_tamanho_bytes: uploadedImage?.size || null,
  });

  if (error) throw error;
  revalidatePath("/dashboard/procedimentos");
  revalidatePath("/dashboard");
}

export async function updateProcedimentoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Procedimento não informado.");
  const uploadedImage = await uploadProcedureImage({ clinicaId, procedimentoId: id, file: formData.get("imagem_file") });
  const imagePayload = uploadedImage ? {
    imagem_url: uploadedImage.publicUrl,
    imagem_storage_path: uploadedImage.path,
    imagem_mime_type: uploadedImage.mimeType,
    imagem_tamanho_bytes: uploadedImage.size,
  } : {};

  const { error } = await supabase
    .from("procedimentos")
    .update({
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
      ...imagePayload,
    })
    .eq("id", id)
    .eq("clinica_id", clinicaId);

  if (error) throw error;
  revalidatePath("/dashboard/procedimentos");
  revalidatePath("/dashboard");
}

export async function toggleProcedimentoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Procedimento não informado.");
  const ativo = text(formData, "ativo") === "true";

  const { error } = await supabase.from("procedimentos").update({ ativo }).eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/procedimentos");
}

export async function deleteProcedimentoAction(formData) {
  const { supabase, clinicaId } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Procedimento não informado.");

  const { error } = await supabase.from("procedimentos").delete().eq("id", id).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/procedimentos");
}

function produtoPayload(formData) {
  return {
    nome: requireValue(text(formData, "nome"), "Informe o nome do produto."),
    sku: nullableText(formData, "sku"),
    codigo_barras: nullableText(formData, "codigo_barras"),
    categoria: nullableText(formData, "categoria"),
    descricao: nullableText(formData, "descricao"),
    custo: Math.max(0, numberValue(formData, "custo", 0)),
    preco: Math.max(0, numberValue(formData, "preco", 0)),
    estoque_atual: Math.max(0, numberValue(formData, "estoque_atual", 0)),
    estoque_minimo: Math.max(0, numberValue(formData, "estoque_minimo", 0)),
    unidade: nullableText(formData, "unidade") || "un",
    publicado_site: formData.get("publicado_site") === "on",
  };
}

function revalidateProdutoPaths(activeClinic) {
  revalidatePath("/dashboard/produtos");
  revalidatePath(`/c/${activeClinic.slug}`);
}

export async function createProdutoAction(formData) {
  const { supabase, clinicaId, activeClinic } = await getScopedSupabase();
  let uploadedImage = null;

  try {
    uploadedImage = await uploadProductImage({ clinicaId, file: formData.get("imagem_file") });
  } catch (error) {
    redirectWithMessage("/dashboard/produtos", "imagem", error.message || "Não foi possível enviar a imagem do produto.");
  }

  const { error } = await supabase.from("produtos_clinica").insert({
    clinica_id: clinicaId,
    ...produtoPayload(formData),
    imagem_url: uploadedImage?.publicUrl || null,
    ativo: true,
  });

  if (error) throw error;
  revalidateProdutoPaths(activeClinic);
}

export async function updateProdutoAction(formData) {
  const { supabase, clinicaId, activeClinic } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Produto não informado.");
  let uploadedImage = null;

  try {
    uploadedImage = await uploadProductImage({ clinicaId, produtoId: id, file: formData.get("imagem_file") });
  } catch (error) {
    redirectWithMessage("/dashboard/produtos", "imagem", error.message || "Não foi possível enviar a imagem do produto.");
  }

  const payload = produtoPayload(formData);
  if (uploadedImage?.publicUrl) payload.imagem_url = uploadedImage.publicUrl;
  const { data: currentProduct, error: currentProductError } = await supabase
    .from("produtos_clinica")
    .select("estoque_reservado")
    .eq("id", id)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  if (currentProductError) throw currentProductError;
  if (payload.estoque_atual < Number(currentProduct?.estoque_reservado || 0)) {
    redirectWithMessage("/dashboard/produtos", "estoque", "O estoque não pode ficar abaixo da quantidade reservada em pedidos abertos.");
  }

  const { error } = await supabase
    .from("produtos_clinica")
    .update(payload)
    .eq("id", id)
    .eq("clinica_id", clinicaId);

  if (error) throw error;
  revalidateProdutoPaths(activeClinic);
}

export async function toggleProdutoAction(formData) {
  const { supabase, clinicaId, activeClinic } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Produto não informado.");
  const campo = text(formData, "campo");
  if (!new Set(["ativo", "publicado_site"]).has(campo)) throw new Error("Campo de produto inválido.");

  const { error } = await supabase
    .from("produtos_clinica")
    .update({ [campo]: text(formData, "valor") === "true" })
    .eq("id", id)
    .eq("clinica_id", clinicaId);

  if (error) throw error;
  revalidateProdutoPaths(activeClinic);
}

export async function deleteProdutoAction(formData) {
  const { supabase, clinicaId, activeClinic } = await getScopedSupabase();
  const id = requireValue(text(formData, "id"), "Produto não informado.");
  const { error } = await supabase
    .from("produtos_clinica")
    .delete()
    .eq("id", id)
    .eq("clinica_id", clinicaId);

  if (error) throw error;
  revalidateProdutoPaths(activeClinic);
}
export async function toggleLojinhaAction(formData) {
  const { clinicaId, activeClinic, memberships } = await getScopedSupabase();
  requireClinicManager(memberships, clinicaId, "/dashboard/produtos");
  const ativa = text(formData, "ativa") === "true";
  const metadata = activeClinic.metadata || {};

  const { error } = await supabaseAdmin
    .from("clinicas")
    .update({
      metadata: {
        ...metadata,
        site_publico: {
          ...(metadata.site_publico || {}),
          lojinha_ativa: ativa,
        },
      },
    })
    .eq("id", clinicaId);

  if (error) throw error;
  revalidatePath("/dashboard/produtos");
  revalidatePath(`/c/${activeClinic.slug}`);
}
export async function updateStoreCommerceSettingsAction(formData) {
  const { clinicaId, activeClinic, memberships } = await getScopedSupabase();
  requireClinicManager(memberships, clinicaId, "/dashboard/produtos");
  const metadata = activeClinic.metadata || {};
  const site = metadata.site_publico || {};
  const currentConfig = site.lojinha_config || {};
  const bairrosEntrega = text(formData, "bairros_entrega")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const nextConfig = {
    ...currentConfig,
    retirada_ativa: formData.get("retirada_ativa") === "on",
    entrega_ativa: formData.get("entrega_ativa") === "on",
    entrega_modo: text(formData, "entrega_modo") === "motoboy" ? "motoboy" : "propria",
    taxa_entrega: Math.max(0, numberValue(formData, "taxa_entrega", 0)),
    frete_gratis_acima: Math.max(0, numberValue(formData, "frete_gratis_acima", 0)),
    pedido_minimo: Math.max(0, numberValue(formData, "pedido_minimo", 0)),
    pagamento_retirada_ativo: formData.get("pagamento_retirada_ativo") === "on",
    checkout_asaas_ativo: formData.get("checkout_asaas_ativo") === "on",
    pix_ativo: formData.get("pix_ativo") === "on",
    cartao_ativo: formData.get("cartao_ativo") === "on",
    reserva_minutos: Math.max(10, Math.min(240, Math.floor(numberValue(formData, "reserva_minutos", 30)))),
    mensagem_retirada: nullableText(formData, "mensagem_retirada"),
    prazo_entrega: nullableText(formData, "prazo_entrega"),
    mensagem_entrega: nullableText(formData, "mensagem_entrega"),
    entrega_cidade: nullableText(formData, "entrega_cidade"),
    bairros_entrega: bairrosEntrega,
  };
  if (!nextConfig.retirada_ativa && !nextConfig.entrega_ativa) {
    redirectWithMessage("/dashboard/produtos", "configuracao", "Ative retirada ou entrega para receber pedidos.");
  }
  const { error } = await supabaseAdmin.from("clinicas").update({
    metadata: { ...metadata, site_publico: { ...site, lojinha_config: nextConfig } },
  }).eq("id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/produtos");
  revalidatePath(`/c/${activeClinic.slug}`);
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
    redirectAgendaError(formData, "Informe uma data válida para o agendamento.");
  }

  let fimRaw = text(formData, "fim");
  let fim = fimRaw ? parseDateTime(fimRaw) : await resolveFimByProcedimento({ supabase, clinicaId, procedimentoId, inicio });

  if (!fim) {
    redirectAgendaError(formData, "Informe o fim do agendamento ou selecione um procedimento com duração cadastrada.", inicioRaw.slice(0, 10));
  }

  if (!fimRaw) {
    const local = new Date(fim.getTime() - fim.getTimezoneOffset() * 60000);
    fimRaw = local.toISOString().slice(0, 16);
  }

  if (fim <= inicio) {
    redirectAgendaError(formData, "O horário final precisa ser maior que o horário inicial.", inicio.toISOString().slice(0, 10));
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
  const id = requireValue(text(formData, "id"), "Cliente não informado.");
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
    status: requireValue(text(formData, "status"), "Status não informado."),
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
  const id = requireValue(text(formData, "id"), "Cliente não informado.");
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
  const clienteId = requireValue(text(formData, "cliente_id"), "Cliente não informado.");
  requireProntuarioAccess(memberships, clinicaId, `/dashboard/clientes/${clienteId}`);

  const { error } = await supabase.from("cliente_fotos").insert({
    clinica_id: clinicaId,
    cliente_id: clienteId,
    tipo: requireValue(text(formData, "tipo"), "Tipo da foto não informado."),
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
  const id = requireValue(text(formData, "id"), "Foto não informada.");
  const clienteId = requireValue(text(formData, "cliente_id"), "Cliente não informado.");
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
  const clienteId = requireValue(text(formData, "cliente_id"), "Cliente não informado.");
  requireProntuarioAccess(memberships, clinicaId, `/dashboard/clientes/${clienteId}`);
  const file = formData.get("arquivo");
  const uploaded = await uploadClientPhoto({ clinicaId, clienteId, file });

  const { error } = await supabaseAdmin.from("cliente_fotos").insert({
    clinica_id: clinicaId,
    cliente_id: clienteId,
    tipo: requireValue(text(formData, "tipo"), "Tipo da foto não informado."),
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
  const clienteId = requireValue(text(formData, "cliente_id"), "Cliente não informado.");
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
  const agendamentoId = requireValue(text(formData, "agendamento_id"), "Agendamento não informado.");
  const clienteId = nullableText(formData, "cliente_id");
  const profissionalId = nullableText(formData, "profissional_id");
  const valor = numberValue(formData, "valor", 0);
  const valorPagoInformado = numberValue(formData, "valor_pago", 0);
  const status = requireValue(text(formData, "pagamento_status"), "Status de pagamento não informado.");
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
  const procedimentoIds = formData
    .getAll("procedimento_ids")
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const { error } = await supabase.from("pacotes_clinica").insert({
    clinica_id: clinicaId,
    nome: requireValue(text(formData, "nome"), "Informe o nome do pacote."),
    descricao: nullableText(formData, "descricao"),
    procedimento_id: procedimentoIds[0] || null,
    procedimento_ids: procedimentoIds,
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
  const pacoteId = requireValue(text(formData, "pacote_id"), "Pacote não informado.");
  const clienteId = requireValue(text(formData, "cliente_id"), "Cliente não informado.");

  const { data: pacote, error: pacoteError } = await supabase
    .from("pacotes_clinica")
    .select("id, nome, quantidade_sessoes, valor, validade_dias")
    .eq("clinica_id", clinicaId)
    .eq("id", pacoteId)
    .maybeSingle();

  if (pacoteError) throw pacoteError;
  if (!pacote) throw new Error("Pacote não encontrado.");

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
  const redirectTo = userRedirectPath(formData);
  requireClinicManager(memberships, clinicaId, redirectTo);
  await redirectLimitError({ clinic: activeClinic, resource: "usuarios", redirectTo });

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
    permissoes: permissionsFromForm(formData, papel),
    ativo: true,
    invited_at: new Date().toISOString(),
    accepted_at: authResult.user?.id ? new Date().toISOString() : null,
  }, { onConflict: "clinica_id,email" });

  if (error) throw error;
  revalidatePath("/dashboard/usuarios");
  revalidatePath("/dashboard/configuracoes");
  revalidatePath("/dashboard/assinatura");
  redirect(`${redirectTo}?ok=${authResult.existed ? "senha" : "convite"}`);
}

export async function updateClinicUserAction(formData) {
  const { supabase, clinicaId, memberships } = await getScopedSupabase();
  const redirectTo = userRedirectPath(formData);
  requireClinicManager(memberships, clinicaId, redirectTo);

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
      permissoes: permissionsFromForm(formData, papel),
      ativo,
    })
    .eq("clinica_id", clinicaId)
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/dashboard/usuarios");
  revalidatePath("/dashboard/configuracoes");
  revalidatePath("/dashboard/assinatura");
  redirect(`${redirectTo}?ok=usuario`);
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
  const id = requireValue(text(formData, "id"), "Oportunidade não informada.");
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
  const id = requireValue(text(formData, "id"), "Oportunidade não informada.");

  const { data: oportunidade, error: opportunityError } = await supabase
    .from("crm_oportunidades")
    .select("id, cliente_id, nome, telefone, email, origem, observacoes")
    .eq("id", id)
    .eq("clinica_id", clinicaId)
    .maybeSingle();

  if (opportunityError) throw opportunityError;
  if (!oportunidade) redirectWithMessage("/dashboard/crm", "crm", "Oportunidade não encontrada.");

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

export async function updateClinicAccountAction(formData) {
  const { clinicaId, memberships, user } = await getScopedSupabase();
  const nome = nullableText(formData, "usuario_nome");
  const email = normalizeEmail(nullableText(formData, "usuario_email"));
  const password = text(formData, "usuario_senha");
  const passwordConfirmation = text(formData, "usuario_senha_confirmacao");
  const currentMembershipRow = currentMembership(memberships, clinicaId);

  if (!user?.id) {
    redirectWithMessage("/dashboard/configuracoes", "conta", "Usuario autenticado nao encontrado.");
  }

  if (!email) {
    redirectWithMessage("/dashboard/configuracoes", "conta", "Informe o e-mail de login.");
  }

  if (password || passwordConfirmation) {
    if (password.length < 8) {
      redirectWithMessage("/dashboard/configuracoes", "conta", "A nova senha precisa ter pelo menos 8 caracteres.");
    }

    if (password !== passwordConfirmation) {
      redirectWithMessage("/dashboard/configuracoes", "conta", "A confirmacao da senha nao confere.");
    }
  }

  const authPayload = {
    email,
    email_confirm: true,
    user_metadata: {
      ...(user.user_metadata || {}),
      nome: nome || currentMembershipRow?.nome || user.email,
    },
  };

  if (password) {
    authPayload.password = password;
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, authPayload);
  if (authError) {
    redirectWithMessage("/dashboard/configuracoes", "conta", authError.message || "Nao foi possivel atualizar o acesso.");
  }

  const { error: membershipError } = await supabaseAdmin
    .from("usuarios_clinica")
    .update({
      nome: nome || currentMembershipRow?.nome || email,
      email,
    })
    .eq("user_id", user.id);

  if (membershipError) {
    redirectWithMessage("/dashboard/configuracoes", "conta", membershipError.message || "Nao foi possivel atualizar o usuario da clinica.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/configuracoes");
  revalidatePath("/dashboard/usuarios");
  redirect("/dashboard/configuracoes?ok=conta");
}

export async function syncClinicDomainAction(formData) {
  const { clinicaId, memberships } = await getScopedSupabase();
  requireClinicManager(memberships, clinicaId, "/dashboard/configuracoes");
  const domain = normalizeCustomDomain(requireValue(text(formData, "dominio"), "Dominio nao informado."));

  const { data: existingDomain, error: existingDomainError } = await supabaseAdmin
    .from("clinica_dominios")
    .select("id, clinica_id")
    .eq("dominio", domain)
    .maybeSingle();

  if (existingDomainError) throw existingDomainError;

  if (!existingDomain || existingDomain.clinica_id !== clinicaId) {
    redirectWithMessage("/dashboard/configuracoes", "dominio", "Dominio nao encontrado nesta clinica.");
  }

  const vercelDomain = await getVercelProjectDomain(domain);
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("clinica_dominios")
    .update({
      status: vercelDomain.status || "pendente",
      verificado_em: vercelDomain.status === "ativo" ? now : null,
      observacoes: vercelDomainObservacoes(vercelDomain),
    })
    .eq("id", existingDomain.id)
    .eq("clinica_id", clinicaId);

  if (error) throw error;
  revalidatePath("/dashboard/configuracoes");
  redirect("/dashboard/configuracoes?ok=configuracoes");
}

export async function removeClinicDomainAction(formData) {
  const { clinicaId, memberships } = await getScopedSupabase();
  requireClinicManager(memberships, clinicaId, "/dashboard/configuracoes");
  const domain = normalizeCustomDomain(requireValue(text(formData, "dominio"), "Dominio nao informado."));

  await removeVercelProjectDomain(domain);

  const { error } = await supabaseAdmin
    .from("clinica_dominios")
    .delete()
    .eq("clinica_id", clinicaId)
    .eq("dominio", domain);

  if (error) throw error;
  revalidatePath("/dashboard/configuracoes");
  redirect("/dashboard/configuracoes?ok=configuracoes");
}

export async function updateClinicSettingsAction(formData) {
  const { clinicaId, activeClinic, memberships } = await getScopedSupabase();
  requireClinicManager(memberships, clinicaId, "/dashboard/configuracoes");

  const metadata = activeClinic.metadata || {};
  const logoFile = formData.get("logo_file");
  let uploadedLogo = null;
  const siteUploads = {};

  try {
    uploadedLogo = await uploadClinicLogo({ clinicaId, file: logoFile });
    for (const [field, slot] of [
      ["site_hero_image_file", "hero"],
      ["site_profissional_image_file", "profissional"],
      ["site_clinica_foto_1_file", "clinica-1"],
      ["site_clinica_foto_2_file", "clinica-2"],
      ["site_clinica_foto_3_file", "clinica-3"],
      ["site_favicon_file", "favicon"],
      ["site_campaign_image_file", "campaign"],
    ]) {
      const uploaded = await uploadClinicSiteImage({ clinicaId, file: formData.get(field), slot });
      if (uploaded?.publicUrl) siteUploads[field] = uploaded;
    }
  } catch (error) {
    redirectWithMessage("/dashboard/configuracoes", "upload", error.message || "Nao foi possivel enviar a imagem.");
  }

  const { data: currentIntegration, error: currentIntegrationError } = await supabaseAdmin
    .from("clinica_integracoes")
    .select("whatsapp_token")
    .eq("clinica_id", clinicaId)
    .maybeSingle();

  if (currentIntegrationError) throw currentIntegrationError;

  const depoimentos = [1, 2, 3, 4].map((index) => ({
    nome: nullableText(formData, `depoimento_${index}_nome`),
    procedimento: nullableText(formData, `depoimento_${index}_procedimento`),
    texto: nullableText(formData, `depoimento_${index}_texto`),
  })).filter((item) => item.nome || item.procedimento || item.texto);

  const nextMetadata = {
    ...metadata,
    brand_name: nullableText(formData, "brand_name") || requireValue(text(formData, "nome"), "Informe o nome da clínica."),
    logo_url: uploadedLogo?.publicUrl || metadata.logo_url || "",
    logo_storage_path: uploadedLogo?.path || metadata.logo_storage_path || null,
    logo_mime_type: uploadedLogo?.mimeType || metadata.logo_mime_type || null,
    logo_tamanho_bytes: uploadedLogo?.size || metadata.logo_tamanho_bytes || null,
    primary_color: safeHexColor(text(formData, "primary_color"), metadata.primary_color || "#047857"),
    accent_color: safeHexColor(text(formData, "accent_color"), metadata.accent_color || "#10b981"),
    horario_funcionamento: buildScheduleFromForm(formData),
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
      hero_image_url: siteUploads.site_hero_image_file?.publicUrl || metadata.site_publico?.hero_image_url || "",
      hero_image_storage_path: siteUploads.site_hero_image_file?.path || metadata.site_publico?.hero_image_storage_path || null,
      profissional_image_url: siteUploads.site_profissional_image_file?.publicUrl || metadata.site_publico?.profissional_image_url || "",
      profissional_image_storage_path: siteUploads.site_profissional_image_file?.path || metadata.site_publico?.profissional_image_storage_path || null,
      clinica_foto_1: siteUploads.site_clinica_foto_1_file?.publicUrl || metadata.site_publico?.clinica_foto_1 || "",
      clinica_foto_1_storage_path: siteUploads.site_clinica_foto_1_file?.path || metadata.site_publico?.clinica_foto_1_storage_path || null,
      clinica_foto_2: siteUploads.site_clinica_foto_2_file?.publicUrl || metadata.site_publico?.clinica_foto_2 || "",
      clinica_foto_2_storage_path: siteUploads.site_clinica_foto_2_file?.path || metadata.site_publico?.clinica_foto_2_storage_path || null,
      clinica_foto_3: siteUploads.site_clinica_foto_3_file?.publicUrl || metadata.site_publico?.clinica_foto_3 || "",
      clinica_foto_3_storage_path: siteUploads.site_clinica_foto_3_file?.path || metadata.site_publico?.clinica_foto_3_storage_path || null,
      favicon_url: siteUploads.site_favicon_file?.publicUrl || metadata.site_publico?.favicon_url || "",
      favicon_storage_path: siteUploads.site_favicon_file?.path || metadata.site_publico?.favicon_storage_path || null,
      instagram_url: nullableText(formData, "site_instagram_url"),
      google_maps_url: nullableText(formData, "site_google_maps_url"),
      google_reviews_url: nullableText(formData, "site_google_reviews_url"),
      google_reviews_ativo: formData.get("site_google_reviews_ativo") === "on",
      google_place_id: nullableText(formData, "site_google_place_id"),
      depoimentos,
      campanha_ativa: formData.get("site_campanha_ativa") === "on",
      campanha_titulo: nullableText(formData, "site_campanha_titulo"),
      campanha_subtitulo: nullableText(formData, "site_campanha_subtitulo"),
      campanha_texto: nullableText(formData, "site_campanha_texto"),
      campanha_cta_label: nullableText(formData, "site_campanha_cta_label"),
      campanha_cta_url: nullableText(formData, "site_campanha_cta_url"),
      campanha_media_url: nullableText(formData, "site_campanha_media_url"),
      campanha_image_url: siteUploads.site_campaign_image_file?.publicUrl || metadata.site_publico?.campanha_image_url || "",
      campanha_image_storage_path: siteUploads.site_campaign_image_file?.path || metadata.site_publico?.campanha_image_storage_path || null,
      video_ativo: formData.get("site_video_ativo") === "on",
      video_titulo: nullableText(formData, "site_video_titulo"),
      video_subtitulo: nullableText(formData, "site_video_subtitulo"),
      video_url: nullableText(formData, "site_video_url"),
      video_cta_label: nullableText(formData, "site_video_cta_label"),
      video_cta_url: nullableText(formData, "site_video_cta_url"),
    },
  };

  const dominio = nullableText(formData, "site_dominio");

  const { data: updatedClinic, error } = await supabaseAdmin
    .from("clinicas")
    .update({
      nome: requireValue(text(formData, "nome"), "Informe o nome da clínica."),
      documento: nullableText(formData, "documento"),
      telefone: nullableText(formData, "telefone"),
      email: nullableText(formData, "email"),
      endereco: nullableText(formData, "endereco"),
      cidade: nullableText(formData, "cidade"),
      estado: nullableText(formData, "estado"),
      metadata: nextMetadata,
    })
    .eq("id", clinicaId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!updatedClinic?.id) {
    redirectWithMessage("/dashboard/configuracoes", "salvar", "As configuracoes nao foram gravadas. Tente novamente.");
  }

  const { error: integrationError } = await supabaseAdmin
    .from("clinica_integracoes")
    .upsert({
      clinica_id: clinicaId,
      email_ativo: formData.get("email_ativo") === "on",
      email_destino: nullableText(formData, "email_destino"),
      email_remetente: nullableText(formData, "email_remetente"),
      whatsapp_ativo: formData.get("whatsapp_ativo") === "on",
      whatsapp_provider: normalizeProvider(nullableText(formData, "whatsapp_provider")) || "zapi",
      whatsapp_numero_destino: nullableText(formData, "whatsapp_numero_destino"),
      whatsapp_webhook_url: nullableText(formData, "whatsapp_webhook_url"),
      whatsapp_token: nullableText(formData, "whatsapp_token") || currentIntegration?.whatsapp_token || null,
    }, { onConflict: "clinica_id" });

  if (integrationError) throw integrationError;

  if (dominio) {
    const normalizedDomain = normalizeCustomDomain(dominio);
    const { data: existingDomain, error: existingDomainError } = await supabaseAdmin
      .from("clinica_dominios")
      .select("id, clinica_id, dominio, status, verificado_em, observacoes")
      .eq("dominio", normalizedDomain)
      .maybeSingle();

    if (existingDomainError) throw existingDomainError;

    if (existingDomain?.clinica_id && existingDomain.clinica_id !== clinicaId) {
      redirectWithMessage("/dashboard/configuracoes", "dominio", "Este dominio ja esta vinculado a outra clinica.");
    }

    let vercelDomain;
    try {
      vercelDomain = await ensureVercelProjectDomain(normalizedDomain);
    } catch (error) {
      vercelDomain = {
        configured: true,
        ok: false,
        status: "erro",
        verified: false,
        message: error.message || "Nao foi possivel conectar na Vercel para adicionar o dominio.",
      };
    }
    const now = new Date().toISOString();
    const { error: domainError } = await supabaseAdmin.from("clinica_dominios").upsert({
      clinica_id: clinicaId,
      dominio: normalizedDomain,
      status: vercelDomain.status || "pendente",
      verificado_em: vercelDomain.status === "ativo" ? now : null,
      observacoes: vercelDomainObservacoes(vercelDomain),
    }, { onConflict: "dominio" });

    if (domainError) throw domainError;
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/configuracoes");
  revalidatePath(`/c/${activeClinic.slug}`);
  redirect("/dashboard/configuracoes?ok=configuracoes");
}

function publicAppOrigin(requestHeaders) {
  const configured = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const protocol = requestHeaders.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  return `${protocol}://${host}`;
}

function isPublicOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" && !["localhost", "127.0.0.1", "::1"].includes(hostname) && !hostname.endsWith(".local");
  } catch {
    return false;
  }
}

export async function connectClinicAsaasAction(formData) {
  const { clinicaId, activeClinic, memberships, user } = await getScopedSupabase();
  requireClinicManager(memberships, clinicaId, "/dashboard/configuracoes");
  const { data: current, error: currentError } = await supabaseAdmin.from("clinica_integracoes")
    .select("asaas_ambiente, asaas_base_url, asaas_configuracao_publica, asaas_segredos_criptografados, asaas_api_key, asaas_webhook_token, asaas_webhook_url")
    .eq("clinica_id", clinicaId).maybeSingle();
  if (currentError) throw currentError;

  const currentSecrets = decryptClinicSecrets(current?.asaas_segredos_criptografados);
  const apiKey = text(formData, "asaas_api_key") || currentSecrets.apiKey || current?.asaas_api_key;
  if (!apiKey) redirectWithMessage("/dashboard/configuracoes", "asaas", "Cole a API Key da conta Asaas da clínica.");
  const ambiente = text(formData, "asaas_ambiente") === "producao" ? "producao" : "sandbox";
  const baseUrl = getAsaasBaseUrl(ambiente);
  const integration = { clinica_id: clinicaId, asaas_ativo: true, ambiente, baseUrl, apiKey };
  const connectionChanged = Boolean((currentSecrets.apiKey || current?.asaas_api_key) && (currentSecrets.apiKey || current?.asaas_api_key) !== apiKey) || Boolean(current?.asaas_ambiente && current.asaas_ambiente !== ambiente);
  const webhookToken = connectionChanged ? randomBytes(32).toString("base64url") : (currentSecrets.webhookToken || current?.asaas_webhook_token || randomBytes(32).toString("base64url"));
  const requestHeaders = await headers();
  const origin = publicAppOrigin(requestHeaders);
  const webhookUrl = `${origin}/api/webhooks/asaas?clinica=${clinicaId}`;
  const canPublishWebhook = isPublicOrigin(origin);
  const notificationEmail = activeClinic.email || user?.email;
  let webhook = null;

  try {
    await validateAsaasConnection(integration);
    if (canPublishWebhook) {
      if (!notificationEmail) throw new Error("Cadastre o e-mail da clínica antes de conectar o webhook Asaas.");
      webhook = await upsertAsaasWebhook({ integration, webhookUrl, authToken: webhookToken, email: notificationEmail });
    }
  } catch (error) {
    redirectWithMessage("/dashboard/configuracoes", "asaas", error.message || "Não foi possível validar a conta Asaas.");
  }

  const currentConfig = current?.asaas_configuracao_publica || {};
  if (connectionChanged && (currentSecrets.apiKey || current?.asaas_api_key) && currentConfig.webhook_id && currentConfig.webhook_id !== webhook?.id) {
    try {
      await removeAsaasWebhook(currentConfig.webhook_id, { ambiente: current?.asaas_ambiente, baseUrl: current?.asaas_base_url, apiKey: currentSecrets.apiKey || current?.asaas_api_key });
    } catch {}
  }

  const now = new Date().toISOString();
  const preservedWebhook = !connectionChanged && currentConfig.webhook_status === "active";
  const { error } = await supabaseAdmin.from("clinica_integracoes").upsert({
    clinica_id: clinicaId, asaas_ativo: true, asaas_ambiente: ambiente, asaas_base_url: baseUrl,
    asaas_configuracao_publica: { baseUrl, connection_status: "connected", connected_at: now, key_last_four: apiKey.slice(-4), webhook_status: canPublishWebhook || preservedWebhook ? "active" : "awaiting_public_url", webhook_id: webhook?.id || (!connectionChanged ? currentConfig.webhook_id : null) || null },
    asaas_segredos_criptografados: encryptClinicSecrets({ apiKey, webhookToken }),
    asaas_webhook_url: canPublishWebhook ? webhookUrl : (preservedWebhook ? current?.asaas_webhook_url : null),
    asaas_ultimo_sync_em: now, asaas_ultimo_erro: null, asaas_api_key: null, asaas_webhook_token: null,
  }, { onConflict: "clinica_id" });
  if (error) throw error;
  revalidatePath("/dashboard/configuracoes"); revalidatePath("/dashboard/produtos"); revalidatePath(`/c/${activeClinic.slug}`);
  redirect("/dashboard/configuracoes?ok=asaas");
}

export async function disconnectClinicAsaasAction() {
  const { clinicaId, activeClinic, memberships } = await getScopedSupabase();
  requireClinicManager(memberships, clinicaId, "/dashboard/configuracoes");
  const { data: current, error: currentError } = await supabaseAdmin.from("clinica_integracoes")
    .select("asaas_ambiente, asaas_base_url, asaas_configuracao_publica, asaas_segredos_criptografados, asaas_api_key")
    .eq("clinica_id", clinicaId).maybeSingle();
  if (currentError) throw currentError;
  const secrets = decryptClinicSecrets(current?.asaas_segredos_criptografados);
  if ((secrets.apiKey || current?.asaas_api_key) && current?.asaas_configuracao_publica?.webhook_id) {
    try { await removeAsaasWebhook(current.asaas_configuracao_publica.webhook_id, { ambiente: current.asaas_ambiente, baseUrl: current.asaas_base_url, apiKey: secrets.apiKey || current.asaas_api_key }); } catch {}
  }
  const { error } = await supabaseAdmin.from("clinica_integracoes").update({
    asaas_ativo: false, asaas_configuracao_publica: { ...(current?.asaas_configuracao_publica || {}), connection_status: "disconnected", webhook_status: "inactive", disconnected_at: new Date().toISOString(), webhook_id: null },
    asaas_segredos_criptografados: null, asaas_webhook_url: null, asaas_api_key: null, asaas_webhook_token: null,
  }).eq("clinica_id", clinicaId);
  if (error) throw error;
  revalidatePath("/dashboard/configuracoes"); revalidatePath("/dashboard/produtos"); revalidatePath(`/c/${activeClinic.slug}`);
  redirect("/dashboard/configuracoes?ok=asaas_desconectado");
}

export async function testClinicWhatsappIntegrationAction() {
  const { clinicaId, activeClinic, memberships } = await getScopedSupabase();
  requireClinicManager(memberships, clinicaId, "/dashboard/configuracoes");

  const { data: integration, error } = await supabaseAdmin
    .from("clinica_integracoes")
    .select("whatsapp_ativo, whatsapp_provider, whatsapp_numero_destino, whatsapp_webhook_url, whatsapp_token")
    .eq("clinica_id", clinicaId)
    .maybeSingle();

  if (error) throw error;

  if (!integration?.whatsapp_ativo) {
    redirectWithMessage("/dashboard/configuracoes", "whatsapp", "Ative a notificacao por WhatsApp e salve as configuracoes antes do teste.");
  }

  if (!integration?.whatsapp_webhook_url || !integration?.whatsapp_token || !integration?.whatsapp_numero_destino) {
    redirectWithMessage("/dashboard/configuracoes", "whatsapp", "Preencha URL da Z-API, Client-Token e WhatsApp destino. Salve e teste novamente.");
  }

  try {
    await sendWhatsAppIntegrationTest({ clinic: activeClinic, integration });
  } catch (error) {
    redirectWithMessage("/dashboard/configuracoes", "whatsapp", error.message || "Nao foi possivel enviar o teste de WhatsApp.");
  }

  redirect("/dashboard/configuracoes?ok=whatsapp");
}




