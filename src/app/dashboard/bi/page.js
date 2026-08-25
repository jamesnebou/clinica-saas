import Link from "next/link";
import { Download, Filter, RotateCcw } from "lucide-react";
import { BIDashboard } from "@/components/bi/bi-dashboard";
import { EmptyClinicState, Notice, PageHeader } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveBIPeriod } from "@/lib/bi/periods";
import { getBIData, getBIFilterOptions } from "@/lib/bi/service";
import { getClinicTerminology } from "@/lib/segments/service";
import { createBIGoalAction, deleteBIGoalAction } from "./actions";
import { getCurrentMembership } from "@/lib/auth/permissions";

export const metadata = { title: "Inteligência / BI | NexaWi Clínicas" };

const APPOINTMENT_STATUSES = [
  ["", "Todos"], ["agendado", "Agendado"], ["confirmado", "Confirmado"],
  ["em_atendimento", "Em atendimento"], ["concluido", "Concluído"],
  ["faltou", "Faltou"], ["cancelado", "Cancelado"],
];
const PAYMENT_METHODS = [["", "Todas"], ["pix", "Pix"], ["dinheiro", "Dinheiro"], ["cartao", "Cartão"], ["boleto", "Boleto"], ["outro", "Outro"]];
const CRM_STATUSES = [["", "Todos"], ["lead", "Lead"], ["avaliacao_marcada", "Avaliação marcada"], ["em_negociacao", "Em negociação"], ["convertido", "Convertido"], ["perdido", "Perdido"]];

function value(params, key) {
  return typeof params?.[key] === "string" ? params[key].trim() : "";
}

function Select({ label, name, defaultValue, children }) {
  return <label className="block min-w-0"><span className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-500">{label}</span><select name={name} defaultValue={defaultValue} className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[var(--clinic-primary)]">{children}</select></label>;
}

function goalCurrentValue(goal, current) {
  return ({ receita: current.recebido, atendimentos: current.atendimentos, conversao: current.taxa_conversao, ticket_medio: current.ticket_medio, ocupacao: current.taxa_ocupacao, no_show: current.taxa_no_show })[goal.tipo] || 0;
}

export default async function BIPage({ searchParams }) {
  const params = await searchParams;
  const clinicContext = await requireClinicSection("bi");
  const { activeClinic } = clinicContext;
  if (!activeClinic) return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;

  const preset = value(params, "periodo") || "30d";
  const period = resolveBIPeriod({ preset, customStart: value(params, "inicio"), customEnd: value(params, "fim"), clinic: activeClinic });
  const filters = {
    profissional: value(params, "profissional"), procedimento: value(params, "procedimento"),
    categoria: value(params, "categoria"), status: value(params, "status"),
    formaPagamento: value(params, "forma_pagamento"), origem: value(params, "origem"),
    canal: value(params, "canal"), crmStatus: value(params, "crm_status"), segmento: value(params, "segmento"),
  };
  const supabase = await createClient();
  const membership = getCurrentMembership(clinicContext.memberships, activeClinic.id);
  const canManageGoals = ["owner", "admin"].includes(membership?.papel);
  const [biResult, options, terminology] = await Promise.all([
    getBIData({ supabase, clinic: activeClinic, period, filters }),
    getBIFilterOptions({ supabase, clinicId: activeClinic.id }),
    getClinicTerminology(activeClinic.id, supabase),
  ]);

  const exportParams = new URLSearchParams();
  for (const [key, entry] of Object.entries(params || {})) if (typeof entry === "string" && entry) exportParams.set(key, entry);

  return (
    <main className="min-w-0 overflow-x-hidden px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
      <section className="mx-auto max-w-[1600px] min-w-0">
        <PageHeader eyebrow="Inteligência / BI" title="Gestão orientada por dados" description={`Indicadores consolidados de ${activeClinic.metadata?.brand_name || activeClinic.nome}, comparados com o período anterior equivalente e calculados no fuso ${period.timeZone}.`} action={<Link href={`/dashboard/bi/export?${exportParams}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5"><Download size={17} /> Exportar CSV</Link>} />

        <form className="premium-panel mt-6 rounded-lg p-4" action="/dashboard/bi">
          <div className="flex items-center gap-2"><Filter size={18} className="text-[var(--clinic-primary)]" /><h2 className="font-black">Filtros globais</h2><span className="ml-auto text-xs text-neutral-500">Comparação: {period.label}</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-9">
            <Select label="Período" name="periodo" defaultValue={preset}>
              <option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="month">Mês atual</option><option value="previous_month">Mês anterior</option><option value="quarter">Trimestre atual</option><option value="year">Ano atual</option><option value="custom">Personalizado</option>
            </Select>
            <Select label="Profissional" name="profissional" defaultValue={filters.profissional}><option value="">Todos</option>{options.professionals.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>
            <Select label="Procedimento" name="procedimento" defaultValue={filters.procedimento}><option value="">Todos</option>{options.procedures.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>
            <Select label="Categoria" name="categoria" defaultValue={filters.categoria}><option value="">Todas</option>{options.categories.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
            <Select label="Status" name="status" defaultValue={filters.status}>{APPOINTMENT_STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
            <Select label="Pagamento" name="forma_pagamento" defaultValue={filters.formaPagamento}>{PAYMENT_METHODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
            <Select label="Origem / canal" name="origem" defaultValue={filters.origem}><option value="">Todas</option>{options.origins.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
            <Select label="Canal" name="canal" defaultValue={filters.canal}><option value="">Todos</option>{options.channels.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
            <Select label="CRM" name="crm_status" defaultValue={filters.crmStatus}>{CRM_STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
            <Select label="Segmento" name="segmento" defaultValue={filters.segmento}><option value="">Todos da clínica</option>{options.segments.map((item) => <option key={item.segmentos?.slug} value={item.segmentos?.slug}>{item.segmentos?.nome}</option>)}</Select>
          </div>
          {preset === "custom" ? <div className="mt-3 grid gap-3 sm:max-w-xl sm:grid-cols-2"><label className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-500">Início<input name="inicio" type="date" defaultValue={period.current.startKey} className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm" /></label><label className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-500">Fim<input name="fim" type="date" defaultValue={period.current.endKey} className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm" /></label></div> : null}
          <div className="mt-4 flex flex-wrap gap-2"><button type="submit" className="h-10 rounded-lg bg-[var(--clinic-primary)] px-5 text-sm font-bold text-white shadow-lg">Aplicar filtros</button><Link href="/dashboard/bi" className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-700"><RotateCcw size={16} /> Limpar</Link></div>
        </form>

        {biResult.error ? <div className="mt-6"><Notice type="warning" title="BI aguardando ativação"><p>Não foi possível carregar as agregações. Aplique as migrations <strong>20260825100000</strong> e <strong>20260825103000</strong> no Supabase. Detalhe técnico: {biResult.error.message}</p></Notice></div> : <>
          <BIDashboard data={biResult.data} terminology={terminology} />
          <section className="premium-panel mt-6 rounded-lg p-5">
            <div><h2 className="text-lg font-black">Metas da clínica</h2><p className="mt-1 text-sm text-neutral-500">Defina objetivos por período. A meta fica isolada por clínica e pode ser associada a um profissional.</p></div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">{(biResult.data.metas || []).map((goal) => {
              const currentValue = goalCurrentValue(goal, biResult.data.atual || {});
              const progress = Number(goal.valor_meta) > 0 ? Math.min(100, (currentValue / Number(goal.valor_meta)) * 100) : 0;
              return <div key={goal.id} className="rounded-lg border border-neutral-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black capitalize">{goal.tipo.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-neutral-500">{goal.periodo_inicio.split("-").reverse().join("/")} a {goal.periodo_fim.split("-").reverse().join("/")}</p></div>{canManageGoals ? <form action={deleteBIGoalAction}><input type="hidden" name="id" value={goal.id} /><button className="text-xs font-bold text-rose-700">Excluir</button></form> : null}</div><div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-[var(--clinic-primary)]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-neutral-500">{progress.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% atingido</p></div>;
            })}</div>
            {canManageGoals ? <form action={createBIGoalAction} className="mt-5 grid gap-3 rounded-lg bg-neutral-50 p-4 sm:grid-cols-2 xl:grid-cols-6 xl:items-end">
              <Select label="Indicador" name="tipo" defaultValue="receita"><option value="receita">Receita recebida</option><option value="atendimentos">Atendimentos</option><option value="conversao">Conversão (%)</option><option value="ticket_medio">Ticket médio</option><option value="ocupacao">Ocupação (%)</option><option value="no_show">No-show máximo (%)</option></Select>
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-500">Valor<input name="valor_meta" type="number" min="0" step="0.01" required className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm" /></label>
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-500">Início<input name="periodo_inicio" type="date" defaultValue={period.current.startKey} required className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm" /></label>
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-500">Fim<input name="periodo_fim" type="date" defaultValue={period.current.endKey} required className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm" /></label>
              <Select label="Profissional" name="profissional_id" defaultValue=""><option value="">Meta geral</option>{options.professionals.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>
              <button className="h-11 rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white">Adicionar meta</button>
            </form> : null}
          </section>
        </>}
      </section>
    </main>
  );
}
