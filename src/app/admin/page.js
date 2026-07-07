import {
  Activity,
  AlertTriangle,
  Banknote,
  BarChart3,
  Building2,
  CheckCircle2,
  CreditCard,
  Globe2,
  LineChart,
  MessageCircle,
  MousePointerClick,
  ShieldAlert,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { requireInternalAdmin } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Field, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { getClinicUsage, getSystemPlans } from "@/lib/saas/plans";
import { createClinicWithOwnerAction, updateClinicCommercialAction, upsertSystemPlanAction } from "./actions";

export const metadata = { title: "Admin SaaS | NexaWi Clínicas" };

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "Não informado";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateInput(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function limitText(current, limit) {
  return `${current}/${limit}`;
}

function monthStartISO() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function nextMonthStartISO() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

function daysAgoISO(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function SelectField({ label, name, defaultValue = "", children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-neutral-700">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue || ""}
        className="mt-2 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-[#ed7009]"
      >
        {children}
      </select>
    </label>
  );
}

function KpiCard({ label, value, helper, icon: Icon, tone = "light" }) {
  const dark = tone === "dark";

  return (
    <article className={`rounded-[1.5rem] border p-5 shadow-sm ${dark ? "border-white/10 bg-[#1c1c1c] text-white" : "border-neutral-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold ${dark ? "text-white/62" : "text-neutral-500"}`}>{label}</p>
          <strong className="mt-2 block text-3xl font-black tracking-tight">{value}</strong>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${dark ? "bg-white/10 text-orange-300" : "bg-orange-50 text-[#ed7009]"}`}>
          <Icon size={21} />
        </div>
      </div>
      {helper ? <p className={`mt-4 text-xs leading-5 ${dark ? "text-white/56" : "text-neutral-500"}`}>{helper}</p> : null}
    </article>
  );
}

function StatusPill({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-neutral-100 text-neutral-700",
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    accent: "bg-orange-50 text-[#ed7009]",
  };

  return <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${tones[tone] || tones.neutral}`}>{children}</span>;
}

async function loadClinics() {
  const { data, error } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, email, billing_email, telefone, cidade, estado, status, plano, assinatura_status, trial_ends_at, proxima_cobranca_em, bloqueio_motivo, asaas_customer_id, asaas_subscription_id, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return Promise.all(
    (data || []).map(async (clinic) => ({
      ...clinic,
      usage: await getClinicUsage(clinic.id),
    }))
  );
}

async function loadAdminAnalytics() {
  const monthStart = monthStartISO();
  const nextMonthStart = nextMonthStartISO();
  const last30Days = daysAgoISO(30);

  const [siteBookings, crm, appointments, asaasCharges, users, payments, clients] = await Promise.all([
    supabaseAdmin
      .from("site_agendamentos_publicos")
      .select("id, clinica_id, nome, telefone, pagamento_status, valor_total, valor_sinal, invoice_url, created_at")
      .gte("created_at", last30Days)
      .order("created_at", { ascending: false })
      .limit(1200),
    supabaseAdmin
      .from("crm_oportunidades")
      .select("id, clinica_id, nome, origem, status, valor_estimado, created_at, proxima_acao_em")
      .gte("created_at", last30Days)
      .order("created_at", { ascending: false })
      .limit(1200),
    supabaseAdmin
      .from("agendamentos")
      .select("id, clinica_id, status, valor, valor_pago, pagamento_status, inicio, created_at")
      .gte("inicio", monthStart)
      .lt("inicio", nextMonthStart)
      .order("inicio", { ascending: false })
      .limit(1600),
    supabaseAdmin
      .from("asaas_cobrancas")
      .select("id, clinica_id, status, valor, vencimento, pago_em, invoice_url, created_at")
      .gte("created_at", last30Days)
      .order("created_at", { ascending: false })
      .limit(1200),
    supabaseAdmin
      .from("usuarios_clinica")
      .select("id, clinica_id, email, ativo, accepted_at, created_at")
      .order("created_at", { ascending: false })
      .limit(1200),
    supabaseAdmin
      .from("pagamentos_clinica")
      .select("id, clinica_id, status, valor, valor_pago, created_at, data_pagamento")
      .gte("created_at", last30Days)
      .order("created_at", { ascending: false })
      .limit(1200),
    supabaseAdmin
      .from("clientes")
      .select("id, clinica_id, status, origem, created_at")
      .gte("created_at", last30Days)
      .order("created_at", { ascending: false })
      .limit(1200),
  ]);

  for (const result of [siteBookings, crm, appointments, asaasCharges, users, payments, clients]) {
    if (result.error) throw result.error;
  }

  return {
    siteBookings: siteBookings.data || [],
    crm: crm.data || [],
    appointments: appointments.data || [],
    asaasCharges: asaasCharges.data || [],
    users: users.data || [],
    payments: payments.data || [],
    clients: clients.data || [],
  };
}

function buildClinicInsights({ clinics, plans, analytics }) {
  const planMap = new Map(plans.map((plan) => [plan.slug, plan]));
  const byClinic = new Map(
    clinics.map((clinic) => [
      clinic.id,
      {
        siteLeads: 0,
        crmLeads: 0,
        appointments: 0,
        monthExpected: 0,
        monthPaid: 0,
        asaasOpen: 0,
        usersAccepted: 0,
        usersPending: 0,
        newClients: 0,
      },
    ])
  );

  for (const item of analytics.siteBookings) byClinic.get(item.clinica_id) && (byClinic.get(item.clinica_id).siteLeads += 1);
  for (const item of analytics.crm) byClinic.get(item.clinica_id) && (byClinic.get(item.clinica_id).crmLeads += 1);
  for (const item of analytics.clients) byClinic.get(item.clinica_id) && (byClinic.get(item.clinica_id).newClients += 1);

  for (const item of analytics.appointments) {
    const row = byClinic.get(item.clinica_id);
    if (!row) continue;
    const faturavel = !["cancelado", "faltou"].includes(item.status) && item.pagamento_status !== "cancelado";
    if (faturavel) row.monthExpected += Number(item.valor || 0);
    if (item.pagamento_status === "pago" || Number(item.valor_pago || 0) > 0) row.monthPaid += Number(item.valor_pago || 0);
    row.appointments += 1;
  }

  for (const item of analytics.asaasCharges) {
    const row = byClinic.get(item.clinica_id);
    if (!row) continue;
    if (!["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "pago"].includes(String(item.status || ""))) row.asaasOpen += 1;
  }

  for (const item of analytics.users) {
    const row = byClinic.get(item.clinica_id);
    if (!row || !item.ativo) continue;
    if (item.accepted_at) row.usersAccepted += 1;
    else row.usersPending += 1;
  }

  return clinics.map((clinic) => ({
    ...clinic,
    plan: planMap.get(clinic.plano) || plans[0] || {},
    insights: byClinic.get(clinic.id) || {},
  }));
}

export default async function AdminSaasPage() {
  await requireInternalAdmin();
  const [clinics, plans, analytics] = await Promise.all([loadClinics(), getSystemPlans(), loadAdminAnalytics()]);
  const enrichedClinics = buildClinicInsights({ clinics, plans, analytics });
  const planMap = new Map(plans.map((plan) => [plan.slug, plan]));

  const totalAtivas = clinics.filter((item) => item.status === "ativa" || item.status === "trial").length;
  const trials = clinics.filter((item) => item.status === "trial").length;
  const inadimplentes = clinics.filter((item) => item.status === "inadimplente" || item.assinatura_status === "atrasada").length;
  const isentas = clinics.filter((item) => item.assinatura_status === "isenta").length;
  const mrrPotencial = clinics.reduce((acc, clinic) => acc + Number(planMap.get(clinic.plano)?.preco_mensal || 0), 0);
  const mrrCobravel = clinics
    .filter((clinic) => clinic.assinatura_status !== "isenta" && clinic.status !== "cancelada")
    .reduce((acc, clinic) => acc + Number(planMap.get(clinic.plano)?.preco_mensal || 0), 0);

  const siteLeads = analytics.siteBookings.length;
  const sitePaidSignals = analytics.siteBookings.filter((item) => item.pagamento_status === "pago").length;
  const crmLeads = analytics.crm.length;
  const crmConverted = analytics.crm.filter((item) => item.status === "convertido").length;
  const monthExpected = analytics.appointments
    .filter((item) => !["cancelado", "faltou"].includes(item.status) && item.pagamento_status !== "cancelado")
    .reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const monthReceived = analytics.appointments.reduce((acc, item) => acc + Number(item.valor_pago || 0), 0);
  const openCharges = analytics.asaasCharges.filter((item) => !["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "pago"].includes(String(item.status || "")));
  const usersWithAccess = analytics.users.filter((item) => item.ativo && item.accepted_at).length;
  const usersPendingAccess = analytics.users.filter((item) => item.ativo && !item.accepted_at).length;

  const funnel = [
    { label: "Leads do site", value: siteLeads, icon: Globe2 },
    { label: "Interessados no CRM", value: crmLeads, icon: MessageCircle },
    { label: "Convertidos", value: crmConverted, icon: CheckCircle2 },
    { label: "Sinais pagos", value: sitePaidSignals, icon: CreditCard },
  ];

  const risks = enrichedClinics
    .filter((clinic) => clinic.status === "inadimplente" || clinic.status === "trial" || clinic.insights.usersPending > 0 || clinic.insights.asaasOpen > 0)
    .slice(0, 6);

  const recentActivity = [
    ...analytics.siteBookings.slice(0, 6).map((item) => ({ type: "Site", title: item.nome, detail: `Agendamento público: ${item.pagamento_status}`, created_at: item.created_at })),
    ...analytics.crm.slice(0, 6).map((item) => ({ type: "CRM", title: item.nome, detail: `Etapa: ${item.status}`, created_at: item.created_at })),
    ...analytics.asaasCharges.slice(0, 6).map((item) => ({ type: "Cobrança", title: formatMoney(item.valor), detail: `Status: ${item.status}`, created_at: item.created_at })),
  ]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10);

  return (
    <>
          <div id="visao-geral" className="relative overflow-hidden rounded-[2rem] bg-[#1c1c1c] p-7 text-white shadow-[0_30px_100px_rgba(28,28,28,0.24)] lg:p-9">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(237,112,9,0.34),transparent_24rem),radial-gradient(circle_at_88%_0%,rgba(255,255,255,0.12),transparent_24rem)]" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_420px] lg:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">Admin interno</p>
                <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Centro de comando do SaaS</h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-white/68">
                  Visão executiva para acompanhar aquisição, ativação, financeiro, leads do site, cobranças e risco operacional das clínicas.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                  <p className="text-xs text-white/54">MRR cobrável</p>
                  <strong className="mt-1 block text-2xl font-black">{formatMoney(mrrCobravel)}</strong>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                  <p className="text-xs text-white/54">MRR potencial</p>
                  <strong className="mt-1 block text-2xl font-black">{formatMoney(mrrPotencial)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div id="metricas" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Clínicas totais" value={clinics.length} helper={`${totalAtivas} ativas ou em trial`} icon={Building2} />
            <KpiCard label="Trial ativo" value={trials} helper="Oportunidades que precisam virar assinatura." icon={TrendingUp} />
            <KpiCard label="Inadimplentes" value={inadimplentes} helper={`${openCharges.length} cobranças abertas nos últimos 30 dias.`} icon={ShieldAlert} />
            <KpiCard label="Isentas" value={isentas} helper="Parcerias, permutas ou liberações comerciais." icon={UserCheck} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Faturamento previsto/mês" value={formatMoney(monthExpected)} helper="Baseado em agendamentos faturáveis do mês." icon={LineChart} tone="dark" />
            <KpiCard label="Recebido no mês" value={formatMoney(monthReceived)} helper="Soma de pagamentos registrados nos agendamentos." icon={Banknote} />
            <KpiCard label="Leads do site" value={siteLeads} helper="Agendamentos públicos recebidos nos últimos 30 dias." icon={MousePointerClick} />
            <KpiCard label="Acessos de usuários" value={usersWithAccess} helper={`${usersPendingAccess} usuários ainda sem aceite/acesso confirmado.`} icon={Activity} />
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_420px]">
            <section className="space-y-6">
              <div id="funil" className="grid gap-4 md:grid-cols-4">
                {funnel.map((item) => {
                  const Icon = item.icon;
                  return (
                    <article key={item.label} className="rounded-[1.4rem] border border-neutral-200 bg-white p-5 shadow-sm">
                      <Icon size={21} className="text-[#ed7009]" />
                      <p className="mt-4 text-sm font-semibold text-neutral-500">{item.label}</p>
                      <strong className="mt-1 block text-2xl font-black">{item.value}</strong>
                    </article>
                  );
                })}
              </div>

              <section id="clinicas" className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 border-b border-neutral-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ed7009]">Operação das clínicas</p>
                    <h2 className="mt-2 text-2xl font-black">Saúde comercial por cliente</h2>
                  </div>
                  <span className="text-sm font-semibold text-neutral-500">Dados dos últimos 30 dias</span>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.14em] text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Clínica</th>
                        <th className="px-3 py-2">Plano</th>
                        <th className="px-3 py-2">Site</th>
                        <th className="px-3 py-2">CRM</th>
                        <th className="px-3 py-2">Agenda</th>
                        <th className="px-3 py-2">Previsto</th>
                        <th className="px-3 py-2">Recebido</th>
                        <th className="px-3 py-2">Acesso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrichedClinics.map((clinic) => (
                        <tr key={clinic.id} className="bg-[#fbfaf7]">
                          <td className="rounded-l-2xl px-3 py-3">
                            <p className="font-black">{clinic.nome}</p>
                            <p className="mt-1 text-xs text-neutral-500">{clinic.email || clinic.billing_email || "Sem e-mail"} · {clinic.cidade || "Cidade não informada"}</p>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              <StatusPill tone="accent">{clinic.plano}</StatusPill>
                              <StatusPill tone={clinic.status === "ativa" ? "ok" : clinic.status === "inadimplente" ? "danger" : "warn"}>{clinic.status}</StatusPill>
                            </div>
                          </td>
                          <td className="px-3 py-3 font-bold">{clinic.insights.siteLeads}</td>
                          <td className="px-3 py-3 font-bold">{clinic.insights.crmLeads}</td>
                          <td className="px-3 py-3 font-bold">{clinic.insights.appointments}</td>
                          <td className="px-3 py-3 font-bold">{formatMoney(clinic.insights.monthExpected)}</td>
                          <td className="px-3 py-3 font-bold text-emerald-700">{formatMoney(clinic.insights.monthPaid)}</td>
                          <td className="rounded-r-2xl px-3 py-3 text-xs text-neutral-600">
                            {clinic.insights.usersAccepted} ativo(s)
                            {clinic.insights.usersPending ? <span className="ml-2 font-black text-amber-700">{clinic.insights.usersPending} pendente(s)</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-4">
                {clinics.length === 0 ? (
                  <p className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm">Nenhuma clínica cadastrada.</p>
                ) : (
                  enrichedClinics.map((clinic) => {
                    const plan = clinic.plan || plans[0];
                    return (
                      <details key={clinic.id} className="rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-sm">
                        <summary className="cursor-pointer list-none">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-lg font-black">{clinic.nome}</h2>
                                <StatusPill tone={clinic.status === "ativa" ? "ok" : clinic.status === "inadimplente" ? "danger" : "warn"}>{clinic.status}</StatusPill>
                                <StatusPill tone="accent">{clinic.assinatura_status}</StatusPill>
                              </div>
                              <p className="mt-2 text-sm text-neutral-500">{clinic.email || clinic.billing_email || "Sem e-mail"} · {clinic.cidade || "Cidade não informada"}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-neutral-600 sm:grid-cols-4 lg:min-w-[420px]">
                              <span className="rounded-xl bg-neutral-50 px-3 py-2">Usuários <b>{limitText(clinic.usage.usuarios, plan?.limite_usuarios || 0)}</b></span>
                              <span className="rounded-xl bg-neutral-50 px-3 py-2">Profissionais <b>{limitText(clinic.usage.profissionais, plan?.limite_profissionais || 0)}</b></span>
                              <span className="rounded-xl bg-neutral-50 px-3 py-2">Clientes <b>{limitText(clinic.usage.clientes, plan?.limite_clientes || 0)}</b></span>
                              <span className="rounded-xl bg-neutral-50 px-3 py-2">Agenda/mês <b>{limitText(clinic.usage.agendamentos_mes, plan?.limite_agendamentos_mes || 0)}</b></span>
                            </div>
                          </div>
                        </summary>

                        <form action={updateClinicCommercialAction} className="mt-5 grid gap-4 rounded-2xl bg-neutral-50 p-4 md:grid-cols-3">
                          <input type="hidden" name="clinica_id" value={clinic.id} />
                          <SelectField label="Status" name="status" defaultValue={clinic.status}>
                            <option value="trial">Trial</option>
                            <option value="ativa">Ativa</option>
                            <option value="inadimplente">Inadimplente</option>
                            <option value="cancelada">Cancelada</option>
                          </SelectField>
                          <SelectField label="Plano" name="plano" defaultValue={clinic.plano}>
                            {plans.map((planOption) => (
                              <option key={planOption.slug} value={planOption.slug}>{planOption.nome} · {formatMoney(planOption.preco_mensal)}</option>
                            ))}
                          </SelectField>
                          <Field label="Fim do trial" name="trial_ends_at" type="date" defaultValue={formatDateInput(clinic.trial_ends_at)} />
                          <Field label="E-mail cobrança" name="billing_email" type="email" defaultValue={clinic.billing_email || clinic.email || ""} />
                          <Field label="Próxima cobrança" name="proxima_cobranca_em" type="date" defaultValue={clinic.proxima_cobranca_em || ""} />
                          <Field label="Asaas customer ID" name="asaas_customer_id" defaultValue={clinic.asaas_customer_id || ""} />
                          <Field label="Asaas subscription ID" name="asaas_subscription_id" defaultValue={clinic.asaas_subscription_id || ""} />
                          <label className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 md:col-span-3">
                            <input type="checkbox" name="isento_cobranca" defaultChecked={clinic.assinatura_status === "isenta"} />
                            Isentar cobrança desta clínica
                          </label>
                          <div className="md:col-span-3">
                            <TextArea label="Motivo de bloqueio/observação" name="bloqueio_motivo" defaultValue={clinic.bloqueio_motivo || ""} />
                          </div>
                          <div className="md:col-span-3">
                            <SubmitButton>Salvar clínica</SubmitButton>
                          </div>
                        </form>
                      </details>
                    );
                  })
                )}
              </section>
            </section>

            <aside className="space-y-6">
              <section id="alertas" className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={20} className="text-[#ed7009]" />
                  <h2 className="text-lg font-black">Alertas comerciais</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {risks.length ? (
                    risks.map((clinic) => (
                      <div key={clinic.id} className="rounded-2xl border border-neutral-100 bg-[#fbfaf7] p-4">
                        <p className="font-black">{clinic.nome}</p>
                        <p className="mt-1 text-xs leading-5 text-neutral-500">
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
              </section>

              <section className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Activity size={20} className="text-[#ed7009]" />
                  <h2 className="text-lg font-black">Atividade recente</h2>
                </div>
                <div className="mt-4 space-y-3">
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
              </section>

              <form id="nova-clinica" action={createClinicWithOwnerAction} className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black">Criar clínica e owner</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">Cria a clínica, cria ou atualiza o usuário no Supabase Auth e vincula como owner.</p>
                <div className="mt-4 space-y-4">
                  <Field label="Nome da clínica" name="nome" required />
                  <Field label="Slug" name="slug" placeholder="clinica-bella-skin" />
                  <Field label="Marca exibida" name="brand_name" placeholder="Bella Skin" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Documento" name="documento" />
                    <Field label="Telefone" name="telefone" />
                    <Field label="Cidade" name="cidade" />
                    <Field label="Estado" name="estado" />
                  </div>
                  <Field label="E-mail da clínica" name="email" type="email" />
                  <Field label="Endereço" name="endereco" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField label="Status inicial" name="status" defaultValue="trial">
                      <option value="trial">Trial</option>
                      <option value="ativa">Ativa</option>
                    </SelectField>
                    <SelectField label="Plano" name="plano" defaultValue="starter">
                      {plans.map((planOption) => (
                        <option key={planOption.slug} value={planOption.slug}>{planOption.nome}</option>
                      ))}
                    </SelectField>
                  </div>
                  <div className="rounded-2xl bg-neutral-50 p-3">
                    <p className="text-sm font-black text-neutral-800">Owner da clínica</p>
                    <div className="mt-3 space-y-4">
                      <Field label="Nome do owner" name="owner_nome" />
                      <Field label="E-mail do owner" name="owner_email" type="email" required />
                      <Field label="Senha temporária" name="owner_password" type="password" required />
                    </div>
                  </div>
                  <SubmitButton>Criar clínica</SubmitButton>
                </div>
              </form>

              <section id="planos-admin" className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black">Planos do sistema</h2>
                <div className="mt-4 space-y-3">
                  {plans.map((plan) => (
                    <div key={plan.slug} className="rounded-2xl border border-neutral-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black">{plan.nome}</p>
                          <p className="mt-1 text-xs text-neutral-500">{plan.slug} · {formatMoney(plan.preco_mensal)}/mês</p>
                        </div>
                        <StatusPill tone={plan.ativo ? "ok" : "neutral"}>{plan.ativo ? "ativo" : "inativo"}</StatusPill>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-neutral-600">{plan.limite_usuarios} usuários · {plan.limite_profissionais} profissionais · {plan.limite_clientes} clientes · {plan.limite_agendamentos_mes} agendamentos/mês</p>
                    </div>
                  ))}
                </div>
              </section>

              <form action={upsertSystemPlanAction} className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black">Criar ou atualizar plano</h2>
                <div className="mt-4 space-y-4">
                  <Field label="Slug" name="slug" placeholder="starter" required />
                  <Field label="Nome" name="nome" placeholder="Starter" required />
                  <Field label="Preço mensal" name="preco_mensal" type="number" defaultValue="0" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Usuários" name="limite_usuarios" type="number" defaultValue="3" />
                    <Field label="Profissionais" name="limite_profissionais" type="number" defaultValue="3" />
                    <Field label="Clientes" name="limite_clientes" type="number" defaultValue="300" />
                    <Field label="Agendamentos/mês" name="limite_agendamentos_mes" type="number" defaultValue="500" />
                  </div>
                  <Field label="Ordem" name="ordem" type="number" defaultValue="0" />
                  <TextArea label="Descrição" name="descricao" />
                  <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                    <input name="ativo" type="checkbox" defaultChecked /> Plano ativo
                  </label>
                  <SubmitButton>Salvar plano</SubmitButton>
                </div>
              </form>
            </aside>
          </div>
    </>
  );
}



