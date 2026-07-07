import { PageHero, PlanForm, StatusPill, formatMoney } from "../admin-core";
import { getSystemPlans } from "@/lib/saas/plans";

export const metadata = { title: "Planos admin | NexaWi Clínicas" };

export default async function DashboardAdminPlanosPage() {
  const plans = await getSystemPlans();

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Planos" title="Planos comerciais do SaaS" description="Configure preço, limites e disponibilidade dos planos vendidos para as clínicas." />

      <section className="grid gap-4 xl:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.slug} className="rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">{plan.nome}</h2>
                <p className="mt-1 text-sm font-semibold text-neutral-500">{plan.slug}</p>
              </div>
              <StatusPill tone={plan.ativo ? "ok" : "neutral"}>{plan.ativo ? "ativo" : "inativo"}</StatusPill>
            </div>
            <strong className="mt-5 block text-3xl font-black">{formatMoney(plan.preco_mensal)}</strong>
            <p className="mt-4 text-sm leading-6 text-neutral-600">
              {plan.limite_usuarios} usuários · {plan.limite_profissionais} profissionais · {plan.limite_clientes} clientes · {plan.limite_agendamentos_mes} agendamentos/mês
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {plans.map((plan) => <PlanForm key={plan.slug} plan={plan} />)}
        <PlanForm />
      </section>
    </div>
  );
}

