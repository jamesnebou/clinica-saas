import { supabaseAdmin } from "@/lib/supabase/admin";

export const ACTIVE_CLINIC_STATUSES = new Set(["trial", "ativa"]);
export const BILLING_WARNING_STATUSES = new Set(["trial", "inadimplente", "cancelada", "bloqueada"]);

export const FALLBACK_PLANS = {
  starter: {
    slug: "starter",
    nome: "Starter",
    preco_mensal: 97,
    limite_usuarios: 3,
    limite_profissionais: 3,
    limite_clientes: 300,
    limite_agendamentos_mes: 500,
  },
  growth: {
    slug: "growth",
    nome: "Growth",
    preco_mensal: 197,
    limite_usuarios: 8,
    limite_profissionais: 10,
    limite_clientes: 2000,
    limite_agendamentos_mes: 3000,
  },
  premium: {
    slug: "premium",
    nome: "Premium",
    preco_mensal: 397,
    limite_usuarios: 25,
    limite_profissionais: 50,
    limite_clientes: 10000,
    limite_agendamentos_mes: 15000,
  },
};

const RESOURCE_CONFIG = {
  usuarios: { table: "usuarios_clinica", limitKey: "limite_usuarios" },
  profissionais: { table: "profissionais", limitKey: "limite_profissionais" },
  clientes: { table: "clientes", limitKey: "limite_clientes" },
};

function startOfMonthISO(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function startOfNextMonthISO(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
}

export function parseInternalAdminEmails() {
  return String(process.env.INTERNAL_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isInternalAdminEmail(email) {
  if (!email) return false;
  return parseInternalAdminEmails().includes(String(email).toLowerCase());
}

export async function getSystemPlans() {
  const { data, error } = await supabaseAdmin
    .from("planos_sistema")
    .select("slug, nome, descricao, preco_mensal, limite_usuarios, limite_profissionais, limite_clientes, limite_agendamentos_mes, ativo, ordem")
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) {
    console.error("Erro ao carregar planos do sistema:", error);
    return Object.values(FALLBACK_PLANS);
  }

  return data?.length ? data : Object.values(FALLBACK_PLANS);
}

export async function getClinicPlan(clinic) {
  const slug = clinic?.plano || "starter";
  const { data, error } = await supabaseAdmin
    .from("planos_sistema")
    .select("slug, nome, descricao, preco_mensal, limite_usuarios, limite_profissionais, limite_clientes, limite_agendamentos_mes, ativo, ordem")
    .eq("slug", slug)
    .maybeSingle();

  if (error) console.error("Erro ao carregar plano da clinica:", error);
  return data || FALLBACK_PLANS[slug] || FALLBACK_PLANS.starter;
}

export async function getClinicUsage(clinicaId) {
  const monthStart = startOfMonthISO();
  const nextMonthStart = startOfNextMonthISO();

  const [usuarios, profissionais, clientes, agendamentosMes] = await Promise.all([
    supabaseAdmin.from("usuarios_clinica").select("id", { count: "exact", head: true }).eq("clinica_id", clinicaId).eq("ativo", true),
    supabaseAdmin.from("profissionais").select("id", { count: "exact", head: true }).eq("clinica_id", clinicaId).eq("ativo", true),
    supabaseAdmin.from("clientes").select("id", { count: "exact", head: true }).eq("clinica_id", clinicaId),
    supabaseAdmin.from("agendamentos").select("id", { count: "exact", head: true }).eq("clinica_id", clinicaId).gte("inicio", monthStart).lt("inicio", nextMonthStart),
  ]);

  for (const result of [usuarios, profissionais, clientes, agendamentosMes]) {
    if (result.error) console.error("Erro ao calcular uso do plano:", result.error);
  }

  return {
    usuarios: usuarios.count || 0,
    profissionais: profissionais.count || 0,
    clientes: clientes.count || 0,
    agendamentos_mes: agendamentosMes.count || 0,
  };
}

export function getClinicBillingState(clinic) {
  const status = clinic?.status || "trial";
  const assinaturaStatus = String(clinic?.assinatura_status || "").toLowerCase();
  const trialEndsAt = clinic?.trial_ends_at ? new Date(clinic.trial_ends_at) : null;
  const trialExpired = status === "trial" && trialEndsAt && trialEndsAt < new Date();

  if (assinaturaStatus === "isenta") {
    return { blocked: false, level: "ok", title: "Assinatura isenta", message: "Esta clínica está liberada por isenção comercial." };
  }

  if (status === "cancelada" || status === "bloqueada") {
    return { blocked: true, level: "danger", title: "Clinica bloqueada", message: clinic?.bloqueio_motivo || "A assinatura desta clinica esta cancelada ou bloqueada." };
  }

  if (status === "inadimplente") {
    return { blocked: true, level: "danger", title: "Pagamento em atraso", message: clinic?.bloqueio_motivo || "Regularize a assinatura para liberar novos cadastros e agendamentos." };
  }

  if (trialExpired) {
    return { blocked: true, level: "warning", title: "Trial expirado", message: "O periodo de teste terminou. Ative um plano para continuar criando novos registros." };
  }

  if (status === "trial") {
    return { blocked: false, level: "info", title: "Clinica em trial", message: trialEndsAt ? `Teste valido ate ${trialEndsAt.toLocaleDateString("pt-BR")}.` : "Clinica em periodo de teste." };
  }

  return { blocked: false, level: "ok", title: "Assinatura ativa", message: "Plano comercial ativo." };
}

export function getLimitRows({ plan, usage }) {
  return [
    { label: "Usuarios", used: usage.usuarios, limit: plan.limite_usuarios },
    { label: "Profissionais", used: usage.profissionais, limit: plan.limite_profissionais },
    { label: "Clientes", used: usage.clientes, limit: plan.limite_clientes },
    { label: "Agendamentos no mes", used: usage.agendamentos_mes, limit: plan.limite_agendamentos_mes },
  ];
}

export function assertClinicOperational(clinic) {
  const state = getClinicBillingState(clinic);
  if (state.blocked) throw new Error(state.message);
}

export async function assertClinicLimit({ clinic, resource }) {
  assertClinicOperational(clinic);

  if (resource === "agendamentos_mes") {
    const plan = await getClinicPlan(clinic);
    const usage = await getClinicUsage(clinic.id);
    if (usage.agendamentos_mes >= plan.limite_agendamentos_mes) {
      throw new Error(`Limite mensal de ${plan.limite_agendamentos_mes} agendamentos atingido no plano ${plan.nome}.`);
    }
    return;
  }

  const config = RESOURCE_CONFIG[resource];
  if (!config) return;

  const plan = await getClinicPlan(clinic);
  let query = supabaseAdmin
    .from(config.table)
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", clinic.id);

  if (["usuarios", "profissionais"].includes(resource)) {
    query = query.eq("ativo", true);
  }

  const { count, error } = await query;

  if (error) throw error;

  if ((count || 0) >= plan[config.limitKey]) {
    throw new Error(`Limite de ${plan[config.limitKey]} ${resource} atingido no plano ${plan.nome}.`);
  }
}
