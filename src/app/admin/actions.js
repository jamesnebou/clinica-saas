"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalAdmin } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

function intValue(formData, key, fallback = 0) {
  return Math.max(1, Math.round(numberValue(formData, key, fallback)));
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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
    return data?.user || existing;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome },
  });

  if (error) throw error;
  return data?.user;
}

export async function createClinicWithOwnerAction(formData) {
  await requireInternalAdmin();

  const nome = requireValue(text(formData, "nome"), "Informe o nome da clinica.");
  const ownerEmail = normalizeEmail(requireValue(text(formData, "owner_email"), "Informe o e-mail do owner."));
  const ownerPassword = requireValue(text(formData, "owner_password"), "Informe uma senha temporaria para o owner.");
  const ownerName = nullableText(formData, "owner_nome") || ownerEmail;
  const slug = slugify(text(formData, "slug") || nome) || `clinica-${Date.now()}`;

  const user = await upsertAuthUserWithPassword({ email: ownerEmail, password: ownerPassword, nome: ownerName });

  const { data: clinica, error: clinicaError } = await supabaseAdmin
    .from("clinicas")
    .insert({
      nome,
      slug,
      documento: nullableText(formData, "documento"),
      telefone: nullableText(formData, "telefone"),
      email: nullableText(formData, "email") || ownerEmail,
      cidade: nullableText(formData, "cidade"),
      estado: nullableText(formData, "estado"),
      endereco: nullableText(formData, "endereco"),
      status: text(formData, "status") || "trial",
      plano: text(formData, "plano") || "starter",
      assinatura_status: text(formData, "status") === "ativa" ? "ativa" : "trial",
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      billing_email: ownerEmail,
      metadata: {
        brand_name: nullableText(formData, "brand_name") || nome,
        primary_color: "#047857",
        accent_color: "#10b981",
      },
    })
    .select("id")
    .single();

  if (clinicaError) throw clinicaError;

  const { error: membershipError } = await supabaseAdmin.from("usuarios_clinica").upsert({
    clinica_id: clinica.id,
    user_id: user?.id || null,
    nome: ownerName,
    email: ownerEmail,
    papel: "owner",
    ativo: true,
    invited_at: new Date().toISOString(),
    accepted_at: new Date().toISOString(),
  }, { onConflict: "clinica_id,email" });

  if (membershipError) throw membershipError;

  revalidatePath("/admin");
  redirect("/admin?ok=clinica");
}

export async function updateClinicCommercialAction(formData) {
  await requireInternalAdmin();
  const id = requireValue(text(formData, "clinica_id"), "Clinica nao informada.");
  const status = requireValue(text(formData, "status"), "Status nao informado.");
  const plano = requireValue(text(formData, "plano"), "Plano nao informado.");
  const trialEndsAt = nullableText(formData, "trial_ends_at");
  const proximaCobranca = nullableText(formData, "proxima_cobranca_em");
  const bloqueioMotivo = nullableText(formData, "bloqueio_motivo");

  const assinaturaStatus = status === "trial"
    ? "trial"
    : status === "ativa"
      ? "ativa"
      : status === "inadimplente"
        ? "atrasada"
        : status === "cancelada"
          ? "cancelada"
          : "ativa";

  const { error } = await supabaseAdmin
    .from("clinicas")
    .update({
      status,
      plano,
      assinatura_status: assinaturaStatus,
      trial_ends_at: trialEndsAt ? new Date(`${trialEndsAt}T23:59:59`).toISOString() : null,
      billing_email: nullableText(formData, "billing_email"),
      proxima_cobranca_em: proximaCobranca,
      asaas_customer_id: nullableText(formData, "asaas_customer_id"),
      asaas_subscription_id: nullableText(formData, "asaas_subscription_id"),
      bloqueio_motivo: bloqueioMotivo,
      bloqueada_em: status === "inadimplente" || status === "cancelada" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function upsertSystemPlanAction(formData) {
  await requireInternalAdmin();
  const slug = requireValue(text(formData, "slug"), "Informe o slug do plano.");

  const payload = {
    slug,
    nome: requireValue(text(formData, "nome"), "Informe o nome do plano."),
    descricao: nullableText(formData, "descricao"),
    preco_mensal: numberValue(formData, "preco_mensal", 0),
    limite_usuarios: intValue(formData, "limite_usuarios", 1),
    limite_profissionais: intValue(formData, "limite_profissionais", 1),
    limite_clientes: intValue(formData, "limite_clientes", 100),
    limite_agendamentos_mes: intValue(formData, "limite_agendamentos_mes", 100),
    ativo: formData.get("ativo") === "on",
    ordem: Math.max(0, Math.round(numberValue(formData, "ordem", 0))),
  };

  const { error } = await supabaseAdmin.from("planos_sistema").upsert(payload, { onConflict: "slug" });
  if (error) throw error;
  revalidatePath("/admin");
}
