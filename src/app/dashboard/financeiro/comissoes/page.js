import { PageHeader } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { getFinanceSettings, listFinanceRows, money, monthPeriod } from "@/lib/finance/service";
import { payCommissionsAction } from "../actions";
import { ExportCsvLink, FinancePage, FinanceTable, Metric, SchemaNotice, StatusPill } from "../shared";

const payableStatuses = new Set(["provisionada", "disponivel"]);

export default async function ComissoesPage({ searchParams }) {
  const { activeClinic } = await requireClinicSection("financeiro");
  const params = await searchParams;
  const period = monthPeriod(params?.month);
  const [result, settings, payments] = await Promise.all([
    listFinanceRows("finance_comissoes", activeClinic.id, { start: period.start, end: period.end, dateColumn: "competencia", limit: 1000 }),
    getFinanceSettings(activeClinic.id),
    listFinanceRows("finance_comissao_pagamentos", activeClinic.id, { start: period.start, end: period.end, dateColumn: "pago_em", limit: 300 }),
  ]);
  const professionalNames = new Map(settings.professionals.map((item) => [item.id, item.nome]));
  const rows = result.rows || [];
  const pending = rows.filter((item) => payableStatuses.has(item.status));
  const paid = rows.filter((item) => item.status === "paga");
  const groups = new Map();
  for (const item of pending) {
    if (!groups.has(item.profissional_id)) groups.set(item.profissional_id, []);
    groups.get(item.profissional_id).push(item);
  }
  const pendingValue = pending.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const paidValue = paid.reduce((sum, item) => sum + Number(item.valor || 0), 0);

  return <FinancePage>
    <PageHeader eyebrow="Financeiro 2.0" title="Comissões e repasses" description="Provisões geradas a partir de recebimentos reais, com pagamento em lote, liquidação e rastreabilidade por profissional." />
    {!result.available || !payments.available ? <div className="mt-6"><SchemaNotice /></div> : <>
      <form className="mt-6 flex max-w-sm gap-3" action="/dashboard/financeiro/comissoes"><input aria-label="Mês" name="month" type="month" defaultValue={period.month} className="dashboard-field h-11 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3" /><button className="rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white">Filtrar</button></form>
      <div className="mt-5 grid gap-4 sm:grid-cols-3"><Metric label="A repassar" value={pendingValue} detail={`${pending.length} comissões disponíveis`} /><Metric label="Pago no período" value={paidValue} detail={`${paid.length} comissões liquidadas`} /><Metric label="Lotes pagos" value={String(payments.rows.length)} detail="com conciliação financeira" /></div>
      <div className="mt-4"><ExportCsvLink report="comissoes" month={period.month} /></div>
      <section className="mt-6 space-y-4"><h2 className="text-lg font-black">Repasses pendentes por profissional</h2>{groups.size ? Array.from(groups.entries()).map(([professionalId, commissions]) => {
        const total = commissions.reduce((sum, item) => sum + Number(item.valor || 0), 0);
        return <form key={professionalId} action={payCommissionsAction} className="premium-panel rounded-lg p-5">
          <div className="flex flex-col gap-2 border-b border-neutral-200 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black">{professionalNames.get(professionalId) || "Profissional inativo"}</h3><p className="text-sm text-neutral-500">{commissions.length} itens selecionáveis</p></div><strong className="text-xl font-black text-[var(--clinic-primary)]">{money(total)}</strong></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{commissions.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 transition hover:border-[var(--clinic-primary)]"><input type="checkbox" name="comissao_id" value={item.id} defaultChecked className="mt-1 h-4 w-4 accent-[var(--clinic-primary)]" /><span><strong className="block text-sm">{money(item.valor)}</strong><span className="mt-1 block text-xs text-neutral-500">Competência {new Date(`${item.competencia}T12:00:00`).toLocaleDateString("pt-BR")}</span><span className="text-xs text-neutral-500">Base {money(item.base_calculo)} · {Number(item.percentual || 0).toLocaleString("pt-BR")}%</span></span></label>)}</div>
          <div className="mt-4 grid gap-3 border-t border-neutral-200 pt-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"><label><span className="text-sm font-semibold">Conta de saída</span><select className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3" name="conta_id"><option value="">Conta padrão</option>{settings.accounts.filter((item) => item.ativa).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label><span className="text-sm font-semibold">Forma de pagamento</span><select className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3" name="forma_pagamento" defaultValue="pix"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="transferencia">Transferência</option><option value="outro">Outro</option></select></label><label><span className="text-sm font-semibold">Data do repasse</span><input className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" name="data_pagamento" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label><button className="h-11 rounded-lg bg-[var(--clinic-primary)] px-5 text-sm font-black text-white">Pagar selecionadas</button></div>
        </form>;
      }) : <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center"><h3 className="font-black">Nenhuma comissão pendente</h3><p className="mt-2 text-sm text-neutral-500">As comissões aparecem aqui após o recebimento que libera o repasse.</p></div>}</section>
      <section className="mt-7"><h2 className="mb-3 text-lg font-black">Histórico do período</h2><FinanceTable rows={rows} columns={[{ key: "competencia", label: "Competência" }, { key: "profissional_id", label: "Profissional", render: (item) => professionalNames.get(item.profissional_id) || "Profissional inativo" }, { key: "base_calculo", label: "Base", render: (item) => money(item.base_calculo) }, { key: "percentual", label: "%", render: (item) => `${Number(item.percentual || 0).toLocaleString("pt-BR")}%` }, { key: "valor", label: "Comissão", render: (item) => money(item.valor) }, { key: "status", label: "Status", render: (item) => <StatusPill status={item.status} /> }]} /></section>
    </>}
  </FinancePage>;
}
