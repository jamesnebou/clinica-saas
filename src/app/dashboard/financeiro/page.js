import { PageHeader } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { getFinanceSummary, monthPeriod, money } from "@/lib/finance/service";
import { FinancePage, Metric, SchemaNotice } from "./shared";

export const metadata = { title: "Financeiro 2.0 | Clínica SaaS" };

export default async function FinanceiroPage({ searchParams }) {
  const { activeClinic } = await requireClinicSection("financeiro");
  const params = await searchParams;
  const period = monthPeriod(params?.month);
  const summary = await getFinanceSummary(activeClinic.id, period);
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
    </>}
  </FinancePage>;
}
