import { PageHeader } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { getFinanceCashFlow, money, monthPeriod } from "@/lib/finance/service";
import { FinancePage, FinanceTable, Metric, SchemaNotice, StatusPill } from "../shared";

export const metadata = { title: "Fluxo de caixa | Financeiro 2.0" };

export default async function FluxoPage({ searchParams }) {
  const { activeClinic } = await requireClinicSection("financeiro");
  const period = monthPeriod((await searchParams)?.month);
  const result = await getFinanceCashFlow(activeClinic.id, period);
  const summary = result.summary || {};
  const realizedBalance = Number(summary.realizedEntries || 0) - Number(summary.realizedExits || 0);
  const projectedBalance = realizedBalance + Number(summary.projectedEntries || 0) - Number(summary.projectedExits || 0);

  return <FinancePage>
    <PageHeader eyebrow="Financeiro" title="Fluxo de caixa" description="Compare dinheiro realizado e compromissos projetados por vencimento, sem misturar transferências internas com resultado." />
    <form className="mt-6 flex max-w-sm gap-3" action="/dashboard/financeiro/fluxo-caixa">
      <input aria-label="Mês" name="month" type="month" defaultValue={period.month} className="dashboard-field h-11 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3" />
      <button className="rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white">Filtrar</button>
    </form>
    {!result.available ? <div className="mt-6"><SchemaNotice /></div> : <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Saldo realizado" value={realizedBalance} detail={`${money(summary.realizedEntries)} entrou · ${money(summary.realizedExits)} saiu`} />
        <Metric label="Entradas projetadas" value={Number(summary.projectedEntries || 0)} detail="Parcelas e recebíveis ainda em aberto" />
        <Metric label="Saídas projetadas" value={Number(summary.projectedExits || 0)} detail="Parcelas e contas ainda em aberto" />
        <Metric label="Saldo projetado" value={projectedBalance} detail={`${money(summary.fees)} em taxas realizadas`} />
      </div>
      <section className="mt-6">
        <FinanceTable columns={[
          { key: "date", label: "Data", render: (row) => new Date(`${row.date}T12:00:00`).toLocaleDateString("pt-BR") },
          { key: "description", label: "Descrição" },
          { key: "status", label: "Visão", render: (row) => <StatusPill status={row.status} /> },
          { key: "entry", label: "Entrada", render: (row) => row.entry ? <span className="font-bold text-emerald-700">{money(row.entry)}</span> : "-" },
          { key: "exit", label: "Saída", render: (row) => row.exit ? <span className="font-bold text-red-700">{money(row.exit)}</span> : "-" },
        ]} rows={result.rows} empty="Nenhum movimento ou compromisso neste período." />
      </section>
      <section className="premium-panel mt-6 rounded-lg p-6">
        <h2 className="text-lg font-black">Como interpretar</h2>
        <p className="mt-3 text-sm leading-6 text-neutral-600">Realizado considera somente dinheiro movimentado. Projetado usa o saldo aberto das parcelas por vencimento. A projeção não altera caixa nem DRE e deixa de aparecer automaticamente conforme a obrigação é liquidada ou cancelada.</p>
      </section>
    </>}
  </FinancePage>;
}
