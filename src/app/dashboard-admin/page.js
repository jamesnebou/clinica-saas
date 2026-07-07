import { KpiCard, PageHero, formatMoney, getOverviewStats, loadDashboardAdminData, metricCards } from "./admin-core";

export const metadata = { title: "Visão geral admin | NexaWi Clínicas" };

function ProgressBar({ label, value, max, helper }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-neutral-800">{label}</p>
        <span className="text-sm font-black text-[#ed7009]">{percent}%</span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-[#ed7009]" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-xs leading-5 text-neutral-500">{helper}</p>
    </div>
  );
}

export default async function DashboardAdminOverviewPage() {
  const { clinics, plans, analytics } = await loadDashboardAdminData();
  const stats = getOverviewStats({ clinics, plans, analytics });

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Visão geral"
        title="Centro de comando do SaaS"
        description="Resumo executivo para acompanhar receita, clínicas, leads, funil comercial e riscos operacionais."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Clínicas totais" value={clinics.length} helper={`${stats.totalAtivas} ativas ou em trial`} icon={metricCards.clinics} />
        <KpiCard label="MRR cobrável" value={formatMoney(stats.mrrCobravel)} helper={`${formatMoney(stats.mrrPotencial)} de MRR potencial`} icon={metricCards.mrr} tone="dark" />
        <KpiCard label="Leads do site" value={stats.siteLeads} helper={`${stats.sitePaidSignals} sinais pagos nos últimos 30 dias`} icon={metricCards.site} />
        <KpiCard label="Inadimplentes" value={stats.inadimplentes} helper={`${stats.openCharges.length} cobranças abertas`} icon={metricCards.debt} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Faturamento previsto" value={formatMoney(stats.monthExpected)} helper="Agendamentos faturáveis do mês." icon={metricCards.plan} />
        <KpiCard label="Recebido no mês" value={formatMoney(stats.monthReceived)} helper="Pagamentos registrados nos agendamentos." icon={metricCards.revenue} />
        <KpiCard label="CRM ativo" value={stats.crmLeads} helper={`${stats.crmConverted} oportunidades convertidas`} icon={metricCards.crm} />
        <KpiCard label="Usuários com acesso" value={stats.usersWithAccess} helper={`${stats.usersPendingAccess} usuários pendentes`} icon={metricCards.access} />
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <ProgressBar label="Conversão CRM" value={stats.crmConverted} max={Math.max(stats.crmLeads, 1)} helper={`${stats.crmConverted} convertidos de ${stats.crmLeads} oportunidades.`} />
        <ProgressBar label="Pagamento de sinais" value={stats.sitePaidSignals} max={Math.max(stats.siteLeads, 1)} helper={`${stats.sitePaidSignals} sinais pagos de ${stats.siteLeads} leads do site.`} />
        <ProgressBar label="Recebido x previsto" value={stats.monthReceived} max={Math.max(stats.monthExpected, 1)} helper={`${formatMoney(stats.monthReceived)} recebidos de ${formatMoney(stats.monthExpected)} previstos.`} />
      </section>
    </div>
  );
}

