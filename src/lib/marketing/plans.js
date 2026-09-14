import { formatPlanLimit } from "../saas/plan-entitlements.mjs";

const planPresentation = {
  starter: {
    badge: "Essencial",
    description: "Para profissionais e clínicas que estão organizando a operação.",
    summary: "Organize a operação.",
  },
  growth: {
    badge: "Recomendado",
    description: "Para clínicas em crescimento que precisam conectar comercial, equipe, financeiro e presença digital.",
    summary: "Profissionalize e faça a clínica crescer. CRM, domínio personalizado e financeiro avançado.",
    highlight: true,
  },
  premium: {
    badge: "Escala",
    description: "Para operações que precisam de mais escala, visão gerencial e recursos avançados.",
    summary: "DRE gerencial, Lojinha e Pedidos, automações ampliadas e limites superiores.",
  },
};

function commercialPlanSlug(plan) {
  const fromSlug = String(plan.slug || "").trim().toLocaleLowerCase("pt-BR");
  if (Object.hasOwn(planPresentation, fromSlug)) return fromSlug;

  const fromName = String(plan.nome || "").trim().toLocaleLowerCase("pt-BR");
  if (Object.hasOwn(planPresentation, fromName)) return fromName;

  return null;
}

export function toMarketingPlans(systemPlans) {
  return systemPlans.filter(plan => !plan.metadata?.internal_only && commercialPlanSlug(plan)).slice(0, 3).map((plan, index) => {
    const slug = commercialPlanSlug(plan, index);
    const presentation = planPresentation[slug] || {};
    return {
      slug,
      name: plan.nome,
      price: Number(plan.preco_mensal || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 2 }),
      badge: presentation.badge,
      description: presentation.description,
      summary: presentation.summary,
      highlight: plan.metadata?.marketing?.highlight ?? presentation.highlight ?? index === 1,
      limits: [
        formatPlanLimit(plan.limite_usuarios, "usuário"),
        formatPlanLimit(plan.limite_profissionais, "profissional", "profissionais"),
        formatPlanLimit(plan.limite_clientes, "paciente"),
        formatPlanLimit(plan.limite_agendamentos_mes, "agendamento/mês", "agendamentos/mês"),
      ],
      catalogLimits: {
        usuarios: Number(plan.limite_usuarios || 0),
        profissionais: Number(plan.limite_profissionais || 0),
        clientes: Number(plan.limite_clientes || 0),
        agendamentos_mes: Number(plan.limite_agendamentos_mes || 0),
      },
    };
  });
}
