import { KpiCard, PageHero, formatMoney, getOverviewStats, loadDashboardAdminData, metricCards } from "../admin-core";

export const metadata = { title: "Métricas admin | NexaWi Clínicas" };

function MetricRow({ label, value, detail }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-neutral-50 px-4 py-3">
      <div>
        <p className="text-sm font-black text-neutral-800">{label}</p>
        <p className="mt-1 text-xs text-neutral-500">{detail}</p>
      </div>
      <strong className="text-lg font-black text-[#ed7009]">{value}</strong>
    </div>
  );
}

export default async function DashboardAdminMetricasPage() {
  const { clinics, plans, analytics, enrichedClinics } = await loadDashboardAdminData();
  const stats = getOverviewStats({ clinics, plans, analytics });
  const topClinics = [...enrichedClinics].sort((a, b) => b.insights.monthExpected - a.insights.monthExpected).slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Métricas" title="Indicadores financeiros e operacionais" description="Acompanhe receita, sinais pagos, agenda, acessos e movimentação comercial das clínicas." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="MRR cobrável" value={formatMoney(stats.mrrCobravel)} helper="Base de clínicas ativas e não isentas." icon={metricCards.mrr} tone="dark" />
        <KpiCard label="Faturamento previsto" value={formatMoney(stats.monthExpected)} helper="Agenda faturável do mês." icon={metricCards.plan} />
        <KpiCard label="Recebido no mês" value={formatMoney(stats.monthReceived)} helper="Pagamentos registrados." icon={metricCards.revenue} />
        <KpiCard label="Cobranças abertas" value={stats.openCharges.length} helper="Asaas nos últimos 30 dias." icon={metricCards.debt} />
      </div>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">Receita por clínica</h2>
          <div className="mt-5 space-y-3">
            {topClinics.map((clinic) => (
              <MetricRow
                key={clinic.id}
                label={clinic.nome}
                value={formatMoney(clinic.insights.monthExpected)}
                detail={`${formatMoney(clinic.insights.monthPaid)} recebido · ${clinic.insights.appointments} agendamentos`}
              />
            ))}
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">Aquisição e operação</h2>
          <div className="mt-5 space-y-3">
            <MetricRow label="Leads do site" value={stats.siteLeads} detail="Agendamentos públicos recebidos." />
            <MetricRow label="Sinais pagos" value={stats.sitePaidSignals} detail="Pagamentos prévios confirmados." />
            <MetricRow label="Oportunidades CRM" value={stats.crmLeads} detail="Leads e negociações criadas." />
            <MetricRow label="Usuários pendentes" value={stats.usersPendingAccess} detail="Convites sem aceite confirmado." />
          </div>
        </article>
      </section>
    </div>
  );
}

