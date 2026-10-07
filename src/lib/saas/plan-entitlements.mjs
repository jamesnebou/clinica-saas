const starter = [
  "agenda",
  "clientes",
  "profissionais",
  "procedimentos",
  "site",
  "pagamentos",
  "financeiro",
  "prontuario",
  "integracoes",
];

const growth = [
  ...starter,
  "crm",
  "automacoes",
  "bi",
  "whatsapp",
  "team_permissions",
  "financeiro_avancado",
  "comissoes",
  "conciliacao",
  "dominio_personalizado",
];

export const PLAN_ENTITLEMENTS = Object.freeze({
  starter: Object.freeze({
    slug: "starter",
    capabilities: Object.freeze(starter),
  }),
  growth: Object.freeze({
    slug: "growth",
    capabilities: Object.freeze(growth),
  }),
  premium: Object.freeze({
    slug: "premium",
    capabilities: Object.freeze([...growth, "dre", "ecommerce", "automacoes_ampliadas", "estoque"]),
  }),
});

export const PLAN_COMPARISON_CATEGORIES = Object.freeze([
  Object.freeze({
    id: "limits",
    label: "Limites",
    rows: Object.freeze([
      Object.freeze({ id: "usuarios", label: "Usuários" }),
      Object.freeze({ id: "profissionais", label: "Profissionais" }),
      Object.freeze({ id: "clientes", label: "Pacientes" }),
      Object.freeze({ id: "agendamentos_mes", label: "Agendamentos por mês" }),
    ]),
  }),
  Object.freeze({
    id: "operacao",
    label: "Operação",
    rows: Object.freeze([
      Object.freeze({ id: "agenda", label: "Agenda inteligente", capability: "agenda" }),
      Object.freeze({ id: "patients", label: "Pacientes e histórico operacional", capability: "clientes" }),
      Object.freeze({ id: "site", label: "Site e agendamento online", capability: "site" }),
    ]),
  }),
  Object.freeze({
    id: "clinico",
    label: "Clínico",
    rows: Object.freeze([
      Object.freeze({ id: "clinical", label: "Prontuário e evolução", capability: "prontuario" }),
      Object.freeze({ id: "treatment", label: "Tratamentos e procedimentos", capability: "procedimentos" }),
    ]),
  }),
  Object.freeze({
    id: "comercial",
    label: "Comercial",
    rows: Object.freeze([
      Object.freeze({ id: "crm", label: "CRM, pipeline e próximas ações", capability: "crm" }),
      Object.freeze({ id: "origin", label: "Origem comercial quando suportada", capability: "crm" }),
    ]),
  }),
  Object.freeze({
    id: "financeiro",
    label: "Financeiro",
    rows: Object.freeze([
      Object.freeze({ id: "finance_basic", label: "Financeiro essencial", capability: "financeiro" }),
      Object.freeze({ id: "finance_full", label: "Financeiro avançado, parcelamentos e pacotes", capability: "financeiro_avancado" }),
      Object.freeze({ id: "reconciliation", label: "Conciliação", capability: "conciliacao" }),
      Object.freeze({ id: "dre", label: "DRE gerencial", capability: "dre" }),
      Object.freeze({ id: "commissions", label: "Produção e comissões", capability: "comissoes" }),
    ]),
  }),
  Object.freeze({
    id: "automation_intelligence",
    label: "Automação e inteligência",
    rows: Object.freeze([
      Object.freeze({ id: "automation", label: "Automações operacionais", capability: "automacoes" }),
      Object.freeze({ id: "automation_extended", label: "Automações ampliadas*", capability: "automacoes_ampliadas" }),
      Object.freeze({ id: "bi", label: "BI operacional", capability: "bi" }),
      Object.freeze({ id: "whatsapp", label: "Central WhatsApp quando configurada", capability: "whatsapp" }),
    ]),
  }),
  Object.freeze({
    id: "team",
    label: "Equipe",
    rows: Object.freeze([
      Object.freeze({ id: "team", label: "Usuários e permissões avançadas", capability: "team_permissions" }),
    ]),
  }),
  Object.freeze({
    id: "presenca", label: "Site", rows: Object.freeze([
      Object.freeze({ id: "custom_domain", label: "Domínio personalizado", capability: "dominio_personalizado" }),
    ]),
  }),
  Object.freeze({
    id: "commerce", label: "Comércio", rows: Object.freeze([
      Object.freeze({ id: "store", label: "Lojinha e Pedidos", capability: "ecommerce" }),
    ]),
  }),
]);

function normalizeSlug(slug) {
  return String(slug || "").trim().toLowerCase();
}

export const ENTITLEMENTS_VERSION = 1;
export const ENTITLEMENT_MODES = Object.freeze(["catalog_v1", "unlimited_lifetime", "internal_full_access"]);
export const REGISTERED_CAPABILITIES = Object.freeze([...new Set(Object.values(PLAN_ENTITLEMENTS).flatMap(plan => plan.capabilities))]);
export const SECTION_ENTITLEMENT = Object.freeze({
  agenda: "agenda", clientes: "clientes", prontuario: "prontuario", profissionais: "profissionais",
  procedimentos: "procedimentos", financeiro: "financeiro", crm: "crm", automacoes: "automacoes",
  bi: "bi", whatsapp: "whatsapp", produtos: "ecommerce", pedidos: "ecommerce",
});
export const FINANCE_REPORT_ENTITLEMENT = Object.freeze({
  receber: "financeiro",
  pagar: "financeiro_avancado",
  movimentacoes: "financeiro_avancado",
  comissoes: "comissoes",
  dre: "dre",
});
export const FINANCE_NAV_ENTITLEMENT = Object.freeze({
  "/dashboard/financeiro": "financeiro",
  "/dashboard/financeiro/receber": "financeiro",
  "/dashboard/financeiro/pacotes": "financeiro_avancado",
  "/dashboard/financeiro/pagar": "financeiro_avancado",
  "/dashboard/financeiro/movimentacoes": "financeiro_avancado",
  "/dashboard/financeiro/fluxo-caixa": "financeiro_avancado",
  "/dashboard/financeiro/comissoes": "comissoes",
  "/dashboard/financeiro/conciliacao": "conciliacao",
  "/dashboard/financeiro/dre": "dre",
  "/dashboard/financeiro/configuracoes": "financeiro_avancado",
});

export function isFullAccessClinic(clinic) {
  return clinic?.plan_entitlements_version === ENTITLEMENTS_VERSION &&
    ["unlimited_lifetime", "internal_full_access"].includes(clinic?.plan_entitlements_mode);
}

export function clinicHasEntitlement(clinic, capability) {
  if (!clinic?.id || !REGISTERED_CAPABILITIES.includes(capability)) return false;
  if (isFullAccessClinic(clinic)) return true;
  if (clinic?.plan_entitlements_mode === "catalog_v1" && clinic?.plan_entitlements_version === ENTITLEMENTS_VERSION) {
    return planHasEntitlement(clinic.plano, capability);
  }
  return false;
}

export function minimumPlanFor(capability) {
  return Object.keys(PLAN_ENTITLEMENTS).find(slug => planHasEntitlement(slug, capability)) || null;
}

export function entitlementUpgradeMessage(capability) {
  const plan = minimumPlanFor(capability);
  if (!plan) return "Recurso indisponível para este plano.";
  return plan === "premium" ? "Recurso exclusivo do plano Premium." : "Disponível a partir do plano Growth.";
}

export function assertPlanEntitlement(clinic, capability) {
  if (clinicHasEntitlement(clinic, capability)) return;
  const plan = minimumPlanFor(capability);
  const error = new Error(entitlementUpgradeMessage(capability));
  error.code = "PLAN_ENTITLEMENT_REQUIRED";
  error.status = 403;
  error.capability = capability;
  error.requiredPlan = plan;
  throw error;
}

export function effectivePlanAccess({ clinic, capability, membership, userAllowed }) {
  return userAllowed === true && membership?.clinica_id === clinic?.id && clinicHasEntitlement(clinic, capability);
}

export function fullAccessLabel(clinic) {
  if (!isFullAccessClinic(clinic)) return null;
  return clinic.plan_entitlements_mode === "unlimited_lifetime" ? "Plano Ilimitado Vitalício" : "Demo — Acesso completo";
}

export function getPlanEntitlements(slug) {
  return PLAN_ENTITLEMENTS[normalizeSlug(slug)] || null;
}

export function planHasEntitlement(slug, capability) {
  return Boolean(getPlanEntitlements(slug)?.capabilities.includes(capability));
}

export function pluralizeLimit(value, singular, plural = `${singular}s`) {
  return Number(value || 0) === 1 ? singular : plural;
}

export function formatPlanLimit(value, singular, plural) {
  const amount = Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return `${amount} ${pluralizeLimit(value, singular, plural)}`;
}

export function buildPlanComparison(plans = []) {
  const lookup = new Map(plans.map((plan) => [normalizeSlug(plan.slug), plan]));
  const planSlugs = ["starter", "growth", "premium"].filter((slug) => lookup.has(slug));

  return PLAN_COMPARISON_CATEGORIES.map((category) => ({
    ...category,
    rows: category.rows.map((row) => ({
      ...row,
      plans: Object.fromEntries(planSlugs.map((slug) => {
        const plan = lookup.get(slug);
        return [slug, row.capability ? planHasEntitlement(slug, row.capability) : plan?.catalogLimits?.[row.id] ?? null];
      })),
    })),
  }));
}
