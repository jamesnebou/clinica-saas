const planPresentation = {
  starter: { badge: "Essencial", summary: "Para estruturar a operação e sair do controle fragmentado." },
  growth: { badge: "Mais escolhido", summary: "Para equipes em crescimento que precisam integrar gestão e vendas.", highlight: true },
  premium: { badge: "Escala", summary: "Para operações com mais agendas, usuários e volume de atendimento." },
};

function integer(value) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function toMarketingPlans(systemPlans) {
  return systemPlans.slice(0, 3).map((plan, index) => {
    const presentation = planPresentation[plan.slug] || {};
    return {
      slug: plan.slug,
      name: plan.nome,
      price: Number(plan.preco_mensal || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 2 }),
      badge: plan.metadata?.marketing?.badge || presentation.badge || `Plano ${index + 1}`,
      description: plan.descricao || presentation.summary || "Plano NexaWi Clínicas.",
      summary: plan.metadata?.marketing?.differentiator || presentation.summary || "Recursos integrados para a operação da clínica.",
      highlight: plan.metadata?.marketing?.highlight ?? presentation.highlight ?? index === 1,
      limits: [
        `${integer(plan.limite_usuarios)} usuários`,
        `${integer(plan.limite_profissionais)} profissionais`,
        `${integer(plan.limite_clientes)} pacientes`,
        `${integer(plan.limite_agendamentos_mes)} agendamentos/mês`,
      ],
    };
  });
}
