import "server-only";

import { ACCESS_SECTIONS } from "@/lib/auth/permissions";
import { normalizeDemoEmail } from "@/lib/domain/demo-core.mjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEMO_CLINIC_NAME, DEMO_EMAIL, DEMO_PASSWORD, DEMO_SLUG } from "./config";
import { buildDemoDataset, DEMO_DATASET_VERSION } from "./dataset.mjs";
import { logDemoError, logDemoEvent } from "./logger";
import { summarizeDemoDataset, validateDemoDataset, validateDemoIdentity } from "./validation.mjs";

const MIGRATION_ERROR_CODES = new Set(["42883", "PGRST202"]);

async function findAuthUserByEmail(email) {
  const targetEmail = normalizeDemoEmail(email);
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data?.users?.find((user) => normalizeDemoEmail(user.email) === targetEmail);
    if (found) return found;
    if (!data?.users?.length || data.users.length < 100) break;
  }
  return null;
}

async function ensureDemoAuthUser() {
  const existing = await findAuthUserByEmail(DEMO_EMAIL);
  const attributes = {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { nome: "Usuário Demo NexaWi", tipo: "demo" },
    app_metadata: { ...(existing?.app_metadata || {}), demo_account: true },
  };
  if (existing?.id) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, attributes);
    if (error) throw error;
    return data.user;
  }
  const { data, error } = await supabaseAdmin.auth.admin.createUser(attributes);
  if (error) throw error;
  return data.user;
}

async function ensureDemoClinic() {
  const nextBilling = new Date();
  nextBilling.setDate(nextBilling.getDate() + 22);
  const payload = {
    nome: DEMO_CLINIC_NAME, slug: DEMO_SLUG, documento: "00.000.000/0001-00",
    telefone: "77999990000", email: DEMO_EMAIL, cidade: "Vitória da Conquista", estado: "BA",
    endereco: "Av. Demo Premium, 1200 - Centro", status: "ativa", plano: "premium",
    trial_ends_at: null, billing_email: DEMO_EMAIL, assinatura_status: "isenta",
    proxima_cobranca_em: nextBilling.toISOString().slice(0, 10), bloqueada_em: null, bloqueio_motivo: null,
    metadata: {
      demo: true, demo_dataset_version: DEMO_DATASET_VERSION,
      marca_cor: "#ed7009", primary_color: "#ed7009", accent_color: "#111111", brand_name: DEMO_CLINIC_NAME,
      site_publicado: true, site_titulo: "Beleza, tecnologia e gestão premium",
      site_subtitulo: "Demonstração real da NexaWi Clínicas com agenda, financeiro, CRM e site integrados.",
      site_descricao_curta: "Clínica demonstrativa com dados fictícios e restauração determinística.",
      site_profissional_nome: "Dra. Helena Martins", site_profissional_credencial_1: "Estética avançada",
      site_profissional_credencial_2: "Harmonização facial", site_profissional_credencial_3: "Protocolos corporais",
      site_bio: "Esta clínica demonstrativa apresenta a experiência real da NexaWi Clínicas. Todos os dados são fictícios e podem ser restaurados com segurança.",
      site_whatsapp: "5577999990000", site_instagram_url: "https://www.instagram.com/nexawi",
      horario_funcionamento: {
        segunda: { ativo: true, inicio: "08:00", fim: "18:00" }, terca: { ativo: true, inicio: "08:00", fim: "18:00" },
        quarta: { ativo: true, inicio: "08:00", fim: "18:00" }, quinta: { ativo: true, inicio: "08:00", fim: "18:00" },
        sexta: { ativo: true, inicio: "08:00", fim: "18:00" }, sabado: { ativo: true, inicio: "08:00", fim: "13:00" },
        domingo: { ativo: false, inicio: "", fim: "" },
      },
    },
  };
  const { data: existing, error: findError } = await supabaseAdmin
    .from("clinicas")
    .select("id,nome,slug,email,metadata")
    .eq("slug", DEMO_SLUG)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    if (existing.metadata?.demo !== true || normalizeDemoEmail(existing.email) !== DEMO_EMAIL) {
      const error = new Error("O slug reservado da demonstração pertence a uma clínica sem os marcadores demo.");
      error.code = "DEMO_CLINIC_COLLISION";
      throw error;
    }

    const { data, error } = await supabaseAdmin
      .from("clinicas")
      .update(payload)
      .eq("id", existing.id)
      .select("id,nome,slug,email,metadata")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("clinicas")
    .insert(payload)
    .select("id,nome,slug,email,metadata")
    .single();
  if (error) throw error;
  return data;
}

async function ensureDemoMembership(clinicId, userId) {
  const permissions = { secoes: ACCESS_SECTIONS };
  const { data, error } = await supabaseAdmin.from("usuarios_clinica").upsert({
    clinica_id: clinicId, user_id: userId, nome: "Usuário Demo NexaWi", email: DEMO_EMAIL,
    papel: "owner", ativo: true, permissions, permissoes: permissions,
    invited_at: new Date().toISOString(), accepted_at: new Date().toISOString(),
  }, { onConflict: "clinica_id,email" }).select("clinica_id,user_id,email,papel,ativo").single();
  if (error) throw error;
  return data;
}

function migrationRequiredError(error) {
  const wrapped = new Error("A migration do ambiente demo v2 ainda não foi aplicada.");
  wrapped.code = "DEMO_MIGRATION_REQUIRED";
  wrapped.cause = error;
  return wrapped;
}

async function registerDemoEnvironment({ user, clinic }) {
  const { error } = await supabaseAdmin.rpc("register_demo_environment_v2", {
    p_actor_user_id: user.id, p_clinic_id: clinic.id, p_login_email: DEMO_EMAIL,
    p_segment_slug: "estetica", p_dataset_version: DEMO_DATASET_VERSION,
  });
  if (error) {
    if (MIGRATION_ERROR_CODES.has(error.code)) throw migrationRequiredError(error);
    throw error;
  }
}

async function executeAtomicReset({ user, dataset }) {
  const { data, error } = await supabaseAdmin.rpc("reset_demo_environment_v2", {
    p_actor_user_id: user.id, p_dataset_version: DEMO_DATASET_VERSION, p_dataset: dataset,
  });
  if (error) {
    if (MIGRATION_ERROR_CODES.has(error.code)) throw migrationRequiredError(error);
    throw error;
  }
  if (!data?.ok) throw new Error("O banco não confirmou a restauração do ambiente demo.");
  return data;
}

export async function prepareDemoClinic() {
  const startedAt = Date.now();
  let stage = "identity.auth";
  logDemoEvent("demo.prepare.started", { datasetVersion: DEMO_DATASET_VERSION });
  try {
    const user = await ensureDemoAuthUser();
    stage = "identity.clinic";
    const clinic = await ensureDemoClinic();
    stage = "identity.membership";
    const membership = await ensureDemoMembership(clinic.id, user.id);
    validateDemoIdentity({ user, clinic, membership, expectedEmail: DEMO_EMAIL, expectedSlug: DEMO_SLUG });
    stage = "environment.register";
    await registerDemoEnvironment({ user, clinic });
    stage = "dataset.build";
    const dataset = buildDemoDataset({ clinicId: clinic.id, userId: user.id, now: new Date() });
    validateDemoDataset(dataset, { clinicId: clinic.id, version: DEMO_DATASET_VERSION });
    stage = "dataset.reset";
    const result = await executeAtomicReset({ user, dataset });
    logDemoEvent("demo.prepare.succeeded", {
      clinicId: clinic.id, userId: user.id, durationMs: Date.now() - startedAt,
      datasetVersion: DEMO_DATASET_VERSION, counts: summarizeDemoDataset(dataset),
    });
    return { user, clinic, result };
  } catch (error) {
    logDemoError("demo.prepare.failed", error, {
      stage,
      durationMs: Date.now() - startedAt,
      datasetVersion: DEMO_DATASET_VERSION,
    });
    throw error;
  }
}

export async function resetDemoClinic() {
  return prepareDemoClinic();
}

export const ensureDemoAccountAndReset = prepareDemoClinic;
export const resetDemoClinicData = resetDemoClinic;
