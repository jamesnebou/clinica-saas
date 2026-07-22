"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalAdmin } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uploadMarketingHomeImage } from "@/lib/supabase/storage";
import { MARKETING_HOME_CONFIG_KEY, normalizeMarketingHomeConfig } from "@/lib/marketing/home-config";

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

function httpUrl(value, message, { optional = false } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized && optional) return null;
  if (!normalized) throw new Error(message);

  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(message);
  }
}

function tutorialSteps(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
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

  const nome = requireValue(text(formData, "nome"), "Informe o nome da clínica.");
  const ownerEmail = normalizeEmail(requireValue(text(formData, "owner_email"), "Informe o e-mail do owner."));
  const ownerPassword = requireValue(text(formData, "owner_password"), "Informe uma senha temporária para o owner.");
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
  revalidatePath("/dashboard-admin");
  revalidatePath("/dashboard-admin/clinicas");
  revalidatePath("/dashboard-admin/nova-alerta");
  redirect("/dashboard-admin/clinicas?ok=clinica");
}

export async function updateClinicCommercialAction(formData) {
  await requireInternalAdmin();
  const id = requireValue(text(formData, "clinica_id"), "Clínica não informada.");
  const status = requireValue(text(formData, "status"), "Status não informado.");
  const plano = requireValue(text(formData, "plano"), "Plano não informado.");
  const trialEndsAt = nullableText(formData, "trial_ends_at");
  const proximaCobranca = nullableText(formData, "proxima_cobranca_em");
  const bloqueioMotivo = nullableText(formData, "bloqueio_motivo");
  const isentoCobranca = formData.get("isento_cobranca") === "on";
  const statusFinal = isentoCobranca ? "ativa" : status;

  const assinaturaStatus = isentoCobranca
    ? "isenta"
    : status === "trial"
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
      status: statusFinal,
      plano,
      assinatura_status: assinaturaStatus,
      trial_ends_at: trialEndsAt ? new Date(`${trialEndsAt}T23:59:59`).toISOString() : null,
      billing_email: nullableText(formData, "billing_email"),
      proxima_cobranca_em: isentoCobranca ? null : proximaCobranca,
      asaas_customer_id: nullableText(formData, "asaas_customer_id"),
      asaas_subscription_id: nullableText(formData, "asaas_subscription_id"),
      bloqueio_motivo: isentoCobranca ? (bloqueioMotivo || "Isenção comercial/manual") : bloqueioMotivo,
      bloqueada_em: isentoCobranca ? null : (status === "inadimplente" || status === "cancelada" ? new Date().toISOString() : null),
    })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/admin");
  revalidatePath("/dashboard-admin");
  revalidatePath("/dashboard-admin/clinicas");
  revalidatePath("/dashboard-admin/alertas");
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
  revalidatePath("/dashboard-admin");
  revalidatePath("/dashboard-admin/planos");
}

export async function upsertClinicTutorialAction(formData) {
  await requireInternalAdmin();

  const id = nullableText(formData, "id");
  const payload = {
    titulo: requireValue(text(formData, "titulo"), "Informe o título do tutorial."),
    descricao_curta: nullableText(formData, "descricao_curta"),
    descricao: nullableText(formData, "descricao"),
    categoria: nullableText(formData, "categoria") || "Primeiros passos",
    video_url: httpUrl(text(formData, "video_url"), "Informe uma URL válida do vídeo."),
    thumbnail_url: httpUrl(text(formData, "thumbnail_url"), "Informe uma URL válida para a capa.", { optional: true }),
    duracao_minutos: intValue(formData, "duracao_minutos", 1),
    ordem: Math.max(0, Math.round(numberValue(formData, "ordem", 0))),
    passos: tutorialSteps(formData.get("passos")),
    destaque: formData.get("destaque") === "on",
    ativo: formData.get("ativo") === "on",
    updated_at: new Date().toISOString(),
  };

  const query = id
    ? supabaseAdmin.from("clinica_tutoriais").update(payload).eq("id", id)
    : supabaseAdmin.from("clinica_tutoriais").insert(payload);
  const { error } = await query;
  if (error) throw error;

  revalidatePath("/dashboard-admin/tutoriais");
  revalidatePath("/dashboard/tutoriais");
  redirect(`/dashboard-admin/tutoriais?ok=${id ? "atualizado" : "criado"}`);
}

export async function deleteClinicTutorialAction(formData) {
  await requireInternalAdmin();
  const id = requireValue(text(formData, "id"), "Tutorial não informado.");
  const { error } = await supabaseAdmin.from("clinica_tutoriais").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/dashboard-admin/tutoriais");
  revalidatePath("/dashboard/tutoriais");
  redirect("/dashboard-admin/tutoriais?ok=excluido");
}

export async function updateInternalAdminCredentialsAction(formData) {
  const user = await requireInternalAdmin();
  const email = normalizeEmail(text(formData, "new_email"));
  const password = text(formData, "password");
  const passwordConfirm = text(formData, "password_confirm");
  const payload = {};

  if (email && email !== normalizeEmail(user.email)) {
    payload.email = email;
    payload.email_confirm = true;
  }

  if (password) {
    if (password.length < 8) {
      throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    }

    if (password !== passwordConfirm) {
      throw new Error("A confirmação da senha não confere.");
    }

    payload.password = password;
  }

  if (!Object.keys(payload).length) {
    throw new Error("Informe um novo e-mail ou uma nova senha.");
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, payload);
  if (error) throw error;

  const { error: roleError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata || {}),
      internal_admin: true,
      role: user.app_metadata?.role || "internal_admin",
    },
  });
  if (roleError) throw roleError;

  revalidatePath("/admin/configuracoes");
  revalidatePath("/dashboard-admin/configuracoes");
  redirect("/dashboard-admin/configuracoes?ok=credenciais");
}




function textareaList(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function metricFromForm(formData, index) {
  return {
    label: text(formData, "hero_metric_" + index + "_label"),
    value: text(formData, "hero_metric_" + index + "_value"),
  };
}

export async function updateMarketingHomeHeroAction(formData) {
  await requireInternalAdmin();

  const uploadedPreviewImage = await uploadMarketingHomeImage({ file: formData.get("hero_preview_image_file") });

  const payload = normalizeMarketingHomeConfig({
    hero: {
      eyebrow: text(formData, "hero_eyebrow"),
      title: text(formData, "hero_title"),
      subtitle: text(formData, "hero_subtitle"),
      primaryCtaLabel: text(formData, "hero_primary_cta_label"),
      secondaryCtaLabel: text(formData, "hero_secondary_cta_label"),
      previewEyebrow: text(formData, "hero_preview_eyebrow"),
      previewTitle: text(formData, "hero_preview_title"),
      previewStatus: text(formData, "hero_preview_status"),
      previewImageUrl: uploadedPreviewImage?.publicUrl || text(formData, "hero_preview_image_url"),
      previewImageAlt: text(formData, "hero_preview_image_alt"),
      metrics: [metricFromForm(formData, 1), metricFromForm(formData, 2), metricFromForm(formData, 3)],
      topics: textareaList(formData.get("hero_topics")),
    },
  });

  const { error } = await supabaseAdmin.from("app_configuracoes").upsert(
    {
      chave: MARKETING_HOME_CONFIG_KEY,
      valor: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chave" }
  );

  if (error) throw error;

  revalidatePath("/");
  revalidatePath("/admin/configuracoes");
  revalidatePath("/dashboard-admin/configuracoes");
  redirect("/dashboard-admin/configuracoes?ok=home");
}
