import { PageHeader } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { getFinanceBudgetComparison, getFinanceSummary, monthPeriod, money } from "@/lib/finance/service";
import { FinancePage, FinanceTable, Metric, SchemaNotice } from "./shared";

export const metadata = { title: "Financeiro 2.0 | Clínica SaaS" };

export default async function FinanceiroPage({ searchParams }) {
  const { activeClinic } = await requireClinicSection("financeiro");
  const params = await searchParams;
  const period = monthPeriod(params?.month);
  const [summary, budget] = await Promise.all([
    getFinanceSummary(activeClinic.id, period),
    getFinanceBudgetComparison(activeClinic.id, period),
  ]);
  const data = summary.data || {};
  const receber = data.receber || {}, pagar = data.pagar || {}, caixa = data.caixa || {}, comissoes = data.comissoes || {};
  return <FinancePage>
    <PageHeader eyebrow="Financeiro 2.0" title="Controle financeiro da clínica" description="Obrigações, caixa, competência, comissões e conciliação em uma fonte única e auditável." />
    <form className="mt-6 flex max-w-sm gap-3" action="/dashboard/financeiro"><input aria-label="Mês" name="month" type="month" defaultValue={period.month} className="dashboard-field h-11 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3"/><button className="rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white">Filtrar</button></form>
    {!summary.available ? <div className="mt-6"><SchemaNotice /></div> : <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Recebido no período" value={Number(receber.recebido || 0)} detail={`${money(receber.aberto)} ainda em aberto`} />
        <Metric label="Saldo de caixa" value={Number(caixa.entradas || 0)-Number(caixa.saidas || 0)} detail={`${money(caixa.entradas)} entradas · ${money(caixa.saidas)} saídas`} />
        <Metric label="Contas a pagar" value={Number(pagar.aberto || 0)} detail={`${money(pagar.vencido)} vencido`} />
        <Metric label="Comissões a repassar" value={Number(comissoes.provisionadas || 0)} detail={`${money(comissoes.pagas)} já pagas`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="premium-panel rounded-lg p-5 lg:col-span-2"><h2 className="text-lg font-black">Saúde financeira</h2><div className="mt-5 grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-neutral-500">A receber</p><strong className="text-xl">{money(receber.aberto)}</strong></div><div><p className="text-xs text-neutral-500">Recebíveis vencidos</p><strong className="text-xl text-red-700">{money(receber.vencido)}</strong></div><div><p className="text-xs text-neutral-500">Taxas financeiras</p><strong className="text-xl">{money(caixa.taxas)}</strong></div></div></section>
        <section className="premium-panel rounded-lg p-5"><h2 className="text-lg font-black">Conciliação</h2><p className="mt-4 text-3xl font-black">{Number(data.conciliacao?.pendentes || 0)}</p><p className="text-sm text-neutral-500">lançamentos pendentes</p><p className="mt-3 text-sm font-semibold text-red-700">{Number(data.conciliacao?.divergentes || 0)} divergências</p></section>
      </div>
      <section className="mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-lg font-black">Orçamento versus realizado</h2><p className="mt-1 text-sm text-neutral-500">Competência gerencial do mês por categoria e centro de custo.</p></div>
          <div className="text-right text-sm"><p className="text-neutral-500">Planejado {money(budget.totals?.planned)}</p><strong>Realizado {money(budget.totals?.actual)}</strong></div>
        </div>
        <FinanceTable columns={[
          { key: "category", label: "Categoria" },
          { key: "center", label: "Centro de custo" },
          { key: "planned", label: "Planejado", render: (row) => money(row.planned) },
          { key: "actual", label: "Realizado", render: (row) => money(row.actual) },
          { key: "variance", label: "Variação", render: (row) => <span className={row.variance > 0 && !["receita", "outra_receita"].includes(row.categoryType) ? "font-bold text-red-700" : "font-bold text-neutral-800"}>{money(row.variance)}</span> },
          { key: "execution", label: "Execução", render: (row) => row.execution === null ? "-" : `${row.execution.toFixed(1)}%` },
        ]} rows={budget.rows || []} empty="Nenhum orçamento definido para este mês." />
      </section>
    </>}
  </FinancePage>;
}
