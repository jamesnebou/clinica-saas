import { KpiCard, PageHero, StatusPill, formatDate, formatMoney, getOverviewStats, loadDashboardAdminData, metricCards } from "../admin-core";

export const metadata = { title: "Funil comercial admin | NexaWi Clínicas" };

export default async function DashboardAdminFunilPage() {
  const { clinics, plans, analytics } = await loadDashboardAdminData();
  const stats = getOverviewStats({ clinics, plans, analytics });
  const recentCrm = analytics.crm.slice(0, 40);

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Funil comercial" title="Leads, oportunidades e conversões" description="Acompanhe a jornada comercial gerada pelos sites das clínicas e pelo CRM operacional." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Leads do site" value={stats.siteLeads} helper="Agendamentos públicos dos últimos 30 dias." icon={metricCards.site} />
        <KpiCard label="Oportunidades" value={stats.crmLeads} helper="Registros criados no CRM." icon={metricCards.crm} />
        <KpiCard label="Convertidos" value={stats.crmConverted} helper="Etapa convertido no CRM." icon={metricCards.conversion} tone="dark" />
        <KpiCard label="Sinais pagos" value={stats.sitePaidSignals} helper="Pagamentos prévios confirmados." icon={metricCards.mrr} />
      </div>

      <section className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-neutral-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ed7009]">Pipeline</p>
            <h2 className="mt-2 text-2xl font-black">Oportunidades recentes</h2>
          </div>
          <span className="text-sm font-semibold text-neutral-500">{recentCrm.length} registros</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.14em] text-neutral-400">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Valor</th>
                <th className="px-3 py-2">Próxima ação</th>
              </tr>
            </thead>
            <tbody>
              {recentCrm.map((item) => (
                <tr key={item.id} className="bg-[#fbfaf7]">
                  <td className="rounded-l-2xl px-3 py-3 font-black">{item.nome}</td>
                  <td className="px-3 py-3">{item.origem || "Não informada"}</td>
                  <td className="px-3 py-3"><StatusPill tone={item.status === "convertido" ? "ok" : item.status === "perdido" ? "danger" : "accent"}>{item.status}</StatusPill></td>
                  <td className="px-3 py-3 font-bold">{formatMoney(item.valor_estimado)}</td>
                  <td className="rounded-r-2xl px-3 py-3 text-neutral-600">{formatDate(item.proxima_acao_em || item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

