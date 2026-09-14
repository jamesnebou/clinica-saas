import { Check, Minus } from "lucide-react";
import { buildPlanComparison, formatPlanLimit } from "@/lib/saas/plan-entitlements.mjs";
import { MarketingSectionView, PlanContactCta } from "../plan-cta";
import styles from "./premium.module.css";

function Value({ value, row }) {
  if (!row.capability) {
    const labels = {
      usuarios: ["usuário"],
      profissionais: ["profissional", "profissionais"],
      clientes: ["paciente"],
      agendamentos_mes: ["agendamento/mês", "agendamentos/mês"],
    };
    return <span>{formatPlanLimit(value, ...labels[row.id])}</span>;
  }
  return value ? <Check aria-label="Incluído" size={18} /> : <Minus aria-label="Não incluído" size={18} />;
}

export function PremiumPlanComparison({ plans, segment }) {
  const comparison = buildPlanComparison(plans);
  const orderedPlans = plans.filter((plan) => ["starter", "growth", "premium"].includes(plan.slug));

  return <section className={styles.planComparison} aria-labelledby="comparar-planos">
    <MarketingSectionView targetId="comparar-planos" eventName="plan_comparison_view" metadata={{ segment }} />
    <div className={styles.container}>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>Compare os planos</p>
        <h2 id="comparar-planos">Veja exatamente o que muda em cada etapa.</h2>
        <p className={styles.description}>Escolha pelo momento da sua clínica. Você pode evoluir conforme a operação cresce.</p>
      </div>
      <div className={styles.comparisonTableWrap}>
        <table className={styles.comparisonTable}>
          <thead><tr><th scope="col">Recursos</th>{orderedPlans.map((plan) => <th scope="col" key={plan.slug}>{plan.name}</th>)}</tr></thead>
          {comparison.map((category) => <tbody key={category.id} className={styles.comparisonCategory}>
            <tr><th colSpan={orderedPlans.length + 1}>{category.label}</th></tr>
            {category.rows.map((row) => <tr key={row.id}><th scope="row">{row.label}</th>{orderedPlans.map((plan) => <td key={plan.slug} data-plan={plan.slug} data-exclusive={["dre", "ecommerce", "automacoes_ampliadas"].includes(row.capability) || undefined}><Value row={row} value={row.plans[plan.slug]} /></td>)}</tr>)}
          </tbody>)}
        </table>
      </div>
      <div className={styles.mobilePlanComparison}>{orderedPlans.map((plan) => <details key={plan.slug} open={plan.slug === "growth"} data-plan={plan.slug}>
        <summary>{plan.name}</summary>{comparison.map((category) => <section key={category.id}><h4>{category.label}</h4><ul>{category.rows.map((row) => <li key={row.id}><span>{row.label}</span><Value row={row} value={row.plans[plan.slug]} /></li>)}</ul></section>)}
      </details>)}</div>
      <p className={styles.comparisonNote}>* WhatsApp depende de habilitação e configuração. A capacidade de automação segue as condições do plano, sem promessa de execuções ilimitadas.</p>
      <div className={styles.recommendationCta}>
        <p>Não sabe qual escolher?</p>
        <span>Conte como sua clínica funciona e a NexaWi recomenda a estrutura mais adequada.</span>
        <PlanContactCta plan="nao_sei" segment={segment} eventNames={["plan_comparison_interaction", "plan_recommendation_click"]} className={styles.recommendationLink} />
      </div>
    </div>
  </section>;
}
