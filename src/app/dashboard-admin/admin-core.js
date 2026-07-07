import { Activity, AlertTriangle, Banknote, CheckCircle2, CreditCard, Globe2, LineChart, MessageCircle, MousePointerClick, ShieldAlert, TrendingUp, UserCheck, UsersRound } from "lucide-react";
import { Field, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClinicUsage, getSystemPlans } from "@/lib/saas/plans";
import { createClinicWithOwnerAction, updateClinicCommercialAction, upsertSystemPlanAction } from "../admin/actions";

export function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value) {
  if (!value) return "Não informado";
  return new Date(value).toLocaleDateString("pt-BR");
}

export function formatDateInput(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function limitText(current, limit) {
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

export function SelectField({ label, name, defaultValue = "", children }) {
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

export function StatusPill({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-neutral-100 text-neutral-700",
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    accent: "bg-orange-50 text-[#ed7009]",
  };

  return <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${tones[tone] || tones.neutral}`}>{children}</span>;
}

export function KpiCard({ label, value, helper, icon: Icon, tone = "light" }) {
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

export function PageHero({ eyebrow, title, description }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-[#1c1c1c] p-7 text-white shadow-[0_30px_100px_rgba(28,28,28,0.24)] lg:p-9">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(237,112,9,0.34),transparent_24rem),radial-gradient(circle_at_88%_0%,rgba(255,255,255,0.12),transparent_24rem)]" />
      <div className="relative max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-4 text-sm leading-7 text-white/68">{description}</p>
      </div>
    </section>
  );
}

export async function loadClinics() {
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

export async function loadAdminAnalytics() {
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
    supabaseAdmin.from("usuarios_clinica").select("id, clinica_id, email, ativo, accepted_at, created_at").order("created_at", { ascending: false }).limit(1200),
    supabaseAdmin.from("pagamentos_clinica").select("id, clinica_id, status, valor, valor_pago, created_at, data_pagamento").gte("created_at", last30Days).order("created_at", { ascending: false }).limit(1200),
    supabaseAdmin.from("clientes").select("id, clinica_id, status, origem, created_at").gte("created_at", last30Days).order("created_at", { ascending: false }).limit(1200),
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

export function buildClinicInsights({ clinics, plans, analytics }) {
  const planMap = new Map(plans.map((plan) => [plan.slug, plan]));
  const byClinic = new Map(
    clinics.map((clinic) => [
      clinic.id,
      { siteLeads: 0, crmLeads: 0, appointments: 0, monthExpected: 0, monthPaid: 0, asaasOpen: 0, usersAccepted: 0, usersPending: 0, newClients: 0 },
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

export async function loadDashboardAdminData() {
  const [clinics, plans, analytics] = await Promise.all([loadClinics(), getSystemPlans(), loadAdminAnalytics()]);
  const enrichedClinics = buildClinicInsights({ clinics, plans, analytics });
  return { clinics, plans, analytics, enrichedClinics };
}

export function getOverviewStats({ clinics, plans, analytics }) {
  const planMap = new Map(plans.map((plan) => [plan.slug, plan]));
  const totalAtivas = clinics.filter((item) => item.status === "ativa" || item.status === "trial").length;
  const trials = clinics.filter((item) => item.status === "trial").length;
  const inadimplentes = clinics.filter((item) => item.status === "inadimplente" || item.assinatura_status === "atrasada").length;
  const isentas = clinics.filter((item) => item.assinatura_status === "isenta").length;
  const mrrPotencial = clinics.reduce((acc, clinic) => acc + Number(planMap.get(clinic.plano)?.preco_mensal || 0), 0);
  const mrrCobravel = clinics
    .filter((clinic) => clinic.assinatura_status !== "isenta" && clinic.status !== "cancelada")
    .reduce((acc, clinic) => acc + Number(planMap.get(clinic.plano)?.preco_mensal || 0), 0);
  const monthExpected = analytics.appointments
    .filter((item) => !["cancelado", "faltou"].includes(item.status) && item.pagamento_status !== "cancelado")
    .reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const monthReceived = analytics.appointments.reduce((acc, item) => acc + Number(item.valor_pago || 0), 0);
  const openCharges = analytics.asaasCharges.filter((item) => !["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "pago"].includes(String(item.status || "")));
  const usersWithAccess = analytics.users.filter((item) => item.ativo && item.accepted_at).length;
  const usersPendingAccess = analytics.users.filter((item) => item.ativo && !item.accepted_at).length;

  return {
    totalAtivas,
    trials,
    inadimplentes,
    isentas,
    mrrPotencial,
    mrrCobravel,
    monthExpected,
    monthReceived,
    openCharges,
    usersWithAccess,
    usersPendingAccess,
    siteLeads: analytics.siteBookings.length,
    sitePaidSignals: analytics.siteBookings.filter((item) => item.pagamento_status === "pago").length,
    crmLeads: analytics.crm.length,
    crmConverted: analytics.crm.filter((item) => item.status === "convertido").length,
  };
}

export function getRisks(enrichedClinics) {
  return enrichedClinics.filter((clinic) => clinic.status === "inadimplente" || clinic.status === "trial" || clinic.insights.usersPending > 0 || clinic.insights.asaasOpen > 0);
}

export function getRecentActivity(analytics) {
  return [
    ...analytics.siteBookings.slice(0, 8).map((item) => ({ type: "Site", title: item.nome, detail: `Agendamento público: ${item.pagamento_status}`, created_at: item.created_at })),
    ...analytics.crm.slice(0, 8).map((item) => ({ type: "CRM", title: item.nome, detail: `Etapa: ${item.status}`, created_at: item.created_at })),
    ...analytics.asaasCharges.slice(0, 8).map((item) => ({ type: "Cobrança", title: formatMoney(item.valor), detail: `Status: ${item.status}`, created_at: item.created_at })),
  ]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 14);
}

export const metricCards = {
  clinics: UsersRound,
  mrr: CreditCard,
  trial: TrendingUp,
  debt: ShieldAlert,
  revenue: Banknote,
  site: MousePointerClick,
  crm: MessageCircle,
  conversion: CheckCircle2,
  access: Activity,
  plan: LineChart,
  globe: Globe2,
  alert: AlertTriangle,
};

export function ClinicEditCard({ clinic, plans }) {
  const plan = clinic.plan || plans[0];

  return (
    <details className="rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-sm">
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
}

export function CreateClinicForm({ plans }) {
  return (
    <form action={createClinicWithOwnerAction} className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
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
  );
}

export function PlanForm({ plan }) {
  return (
    <form action={upsertSystemPlanAction} className="rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Slug" name="slug" placeholder="starter" defaultValue={plan?.slug || ""} required />
        <Field label="Nome" name="nome" placeholder="Starter" defaultValue={plan?.nome || ""} required />
        <Field label="Preço mensal" name="preco_mensal" type="number" defaultValue={plan?.preco_mensal ?? 0} />
        <Field label="Ordem" name="ordem" type="number" defaultValue={plan?.ordem ?? 0} />
        <Field label="Usuários" name="limite_usuarios" type="number" defaultValue={plan?.limite_usuarios ?? 3} />
        <Field label="Profissionais" name="limite_profissionais" type="number" defaultValue={plan?.limite_profissionais ?? 3} />
        <Field label="Clientes" name="limite_clientes" type="number" defaultValue={plan?.limite_clientes ?? 300} />
        <Field label="Agendamentos/mês" name="limite_agendamentos_mes" type="number" defaultValue={plan?.limite_agendamentos_mes ?? 500} />
      </div>
      <div className="mt-4">
        <TextArea label="Descrição" name="descricao" defaultValue={plan?.descricao || ""} />
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-neutral-700">
        <input name="ativo" type="checkbox" defaultChecked={plan?.ativo ?? true} /> Plano ativo
      </label>
      <div className="mt-4">
        <SubmitButton>{plan ? "Salvar plano" : "Criar plano"}</SubmitButton>
      </div>
    </form>
  );
}


