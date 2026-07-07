import { PageHero, StatusPill, formatDate, getRecentActivity, getRisks, loadDashboardAdminData } from "../admin-core";

export const metadata = { title: "Alertas admin | NexaWi Clínicas" };

export default async function DashboardAdminAlertasPage() {
  const { analytics, enrichedClinics } = await loadDashboardAdminData();
  const risks = getRisks(enrichedClinics);
  const recentActivity = getRecentActivity(analytics);

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Alertas" title="Riscos e atividade recente" description="Veja trials, inadimplência, cobranças abertas, usuários pendentes e sinais importantes da operação." />

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <article className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">Alertas comerciais</h2>
          <div className="mt-5 space-y-3">
            {risks.length ? (
              risks.map((clinic) => (
                <div key={clinic.id} className="rounded-2xl border border-neutral-100 bg-[#fbfaf7] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black">{clinic.nome}</p>
                    <StatusPill tone={clinic.status === "inadimplente" ? "danger" : "warn"}>{clinic.status}</StatusPill>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-neutral-500">
                    {clinic.status === "trial" ? `Trial até ${formatDate(clinic.trial_ends_at)}.` : null}
                    {clinic.status === "inadimplente" ? " Clínica inadimplente." : null}
                    {clinic.insights.asaasOpen ? ` ${clinic.insights.asaasOpen} cobrança(s) aberta(s).` : null}
                    {clinic.insights.usersPending ? ` ${clinic.insights.usersPending} usuário(s) sem acesso confirmado.` : null}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">Nenhum alerta crítico agora.</p>
            )}
          </div>
        </article>

        <aside className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">Atividade recente</h2>
          <div className="mt-5 space-y-3">
            {recentActivity.map((item, index) => (
              <div key={`${item.type}-${item.created_at}-${index}`} className="rounded-2xl bg-neutral-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <StatusPill tone="accent">{item.type}</StatusPill>
                  <span className="text-xs font-semibold text-neutral-400">{formatDate(item.created_at)}</span>
                </div>
                <p className="mt-3 font-black">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">{item.detail}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

