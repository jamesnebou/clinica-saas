import { updateMarketingLeadStatusAction } from "@/app/admin/actions";
import { KpiCard, PageHero, StatusPill, formatDate, formatMoney, getOverviewStats, loadDashboardAdminData, metricCards } from "../admin-core";

export const metadata = { title: "Funil comercial admin | NexaWi Clínicas" };

export default async function DashboardAdminFunilPage() {
  const { clinics, plans, analytics } = await loadDashboardAdminData();
  const stats = getOverviewStats({ clinics, plans, analytics });
  const marketingLeads = analytics.marketingLeads.slice(0, 100);
  const recentCrm = analytics.crm.slice(0, 40);

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Funil comercial" title="Interesse, demonstração e conversão" description="Acompanhe os contatos gerados pelo site da NexaWi sem misturá-los ao CRM operacional de cada clínica." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Interessados NexaWi" value={stats.marketingLeads} helper="Contatos captados na página comercial." icon={metricCards.site} />
        <KpiCard label="Acessos à demo" value={stats.demoAccesses} helper="Entradas no painel demonstrativo em 30 dias." icon={metricCards.crm} />
        <KpiCard label="Qualificados" value={stats.marketingQualified} helper="Leads qualificados ou convertidos." icon={metricCards.conversion} />
        <KpiCard label="Convertidos" value={stats.marketingConverted} helper="Clientes ganhos pelo funil comercial." icon={metricCards.mrr} tone="dark" />
      </div>

      <section className="grid gap-3 rounded-[1.75rem] border border-neutral-200 bg-[#1c1c1c] p-5 text-white shadow-sm sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Visitas à página", stats.landingViews],
          ["Entradas na demo", stats.demoAccesses],
          ["Cliques em planos", stats.pricingClicks],
          ["Cliques no WhatsApp", stats.whatsappClicks],
          ["Conversão em lead", `${stats.leadConversionRate.toFixed(1)}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-white/45">{label}</p>
            <strong className="mt-2 block text-2xl font-black">{value}</strong>
          </div>
        ))}
      </section>

      <section className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-neutral-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ed7009]">Aquisição NexaWi</p>
            <h2 className="mt-2 text-2xl font-black">Interessados captados no site</h2>
            <p className="mt-2 text-sm text-neutral-500">Origem, campanha, plano desejado e andamento comercial no mesmo lugar.</p>
          </div>
          <span className="text-sm font-semibold text-neutral-500">{marketingLeads.length} registros</span>
        </div>

        <div className="mt-4 grid gap-3">
          {marketingLeads.length ? marketingLeads.map((lead) => (
            <details key={lead.id} className="rounded-2xl border border-neutral-200 bg-[#fbfaf7] p-4">
              <summary className="cursor-pointer list-none">
                <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_0.7fr_0.7fr_auto] sm:items-center">
                  <div><p className="font-black">{lead.nome}</p><p className="text-xs text-neutral-500">{lead.clinica_nome || "Clínica não informada"}</p></div>
                  <div><p className="font-bold">{lead.whatsapp}</p><p className="text-xs text-neutral-500">{lead.email || "Sem e-mail"}</p></div>
                  <div><p className="text-xs text-neutral-500">Plano</p><p className="font-bold capitalize">{lead.plano_interesse.replace("_", " ")}</p></div>
                  <div><p className="text-xs text-neutral-500">Origem</p><p className="font-bold">{lead.utm_source || lead.origem}</p></div>
                  <StatusPill tone={lead.status === "convertido" ? "ok" : lead.status === "perdido" ? "danger" : "accent"}>{lead.status}</StatusPill>
                </div>
              </summary>
              <form action={updateMarketingLeadStatusAction} className="mt-4 grid gap-3 border-t border-neutral-200 pt-4 md:grid-cols-[220px_1fr_auto] md:items-end">
                <input type="hidden" name="id" value={lead.id} />
                <label className="text-xs font-bold text-neutral-600">Etapa comercial
                  <select name="status" defaultValue={lead.status} className="mt-1 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm">
                    <option value="novo">Novo</option><option value="contatado">Contatado</option><option value="qualificado">Qualificado</option><option value="convertido">Convertido</option><option value="perdido">Perdido</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-neutral-600">Observações
                  <input name="observacoes" defaultValue={lead.observacoes || ""} placeholder="Próxima ação, objeção ou contexto" className="mt-1 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm" />
                </label>
                <button className="h-11 rounded-xl bg-[#1c1c1c] px-5 text-sm font-black text-white">Salvar</button>
              </form>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-500">
                <span>{lead.profissionais_qtd} {lead.profissionais_qtd === 1 ? "profissional" : "profissionais"}</span>
                <span>{lead.utm_campaign ? `Campanha: ${lead.utm_campaign}` : "Sem campanha"}</span>
                <span>{formatDate(lead.created_at)}</span>
              </div>
            </details>
          )) : <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">Os contatos enviados pelo formulário comercial aparecerão aqui.</div>}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-neutral-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ed7009]">CRM dos clientes</p>
            <h2 className="mt-2 text-2xl font-black">Oportunidades das clínicas clientes</h2>
          </div>
          <span className="text-sm font-semibold text-neutral-500">{recentCrm.length} registros</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.14em] text-neutral-400">
              <tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Origem</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2">Próxima ação</th></tr>
            </thead>
            <tbody>
              {recentCrm.map((item) => (
                <tr key={item.id} className="bg-[#fbfaf7]">
                  <td className="rounded-l-2xl px-3 py-3 font-black">{item.nome}</td><td className="px-3 py-3">{item.origem || "Não informada"}</td><td className="px-3 py-3"><StatusPill tone={item.status === "convertido" ? "ok" : item.status === "perdido" ? "danger" : "accent"}>{item.status}</StatusPill></td><td className="px-3 py-3 font-bold">{formatMoney(item.valor_estimado)}</td><td className="rounded-r-2xl px-3 py-3 text-neutral-600">{formatDate(item.proxima_acao_em || item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
