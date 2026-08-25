"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity, CalendarClock, CircleDollarSign, PackageSearch, ShoppingBag,
  Stethoscope, Target, TrendingDown, TrendingUp, UserRoundCheck, UsersRound,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { compareMetric } from "@/lib/domain/bi-core.mjs";

const AREAS = [
  ["geral", "Executivo"],
  ["financeiro", "Financeiro"],
  ["comercial", "Comercial"],
  ["agenda", "Agenda"],
  ["pacientes", "Pacientes"],
  ["procedimentos", "Procedimentos"],
  ["profissionais", "Profissionais"],
  ["estoque", "Estoque"],
  ["ecommerce", "E-commerce"],
];

const STATUS_LABELS = {
  agendado: "Agendados", confirmado: "Confirmados", em_atendimento: "Em atendimento",
  concluido: "Concluídos", faltou: "Faltas", cancelado: "Cancelados",
};

const CHART_COLORS = ["var(--clinic-primary)", "var(--clinic-accent)", "#0f766e", "#d97706", "#7c3aed", "#be123c"];

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function compactMoney(value) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL", maximumFractionDigits: 1 }).format(Number(value || 0));
}

function number(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function percent(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function Comparison({ current, previous, inverse = false }) {
  const comparison = compareMetric(current, previous);
  if (comparison.percentage === null) return <span className="text-xs text-neutral-400">Sem base anterior</span>;
  const positive = inverse ? comparison.percentage <= 0 : comparison.percentage >= 0;
  const Icon = comparison.percentage >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${positive ? "text-emerald-700" : "text-rose-700"}`}>
      <Icon size={14} /> {Math.abs(comparison.percentage).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

function MetricCard({ label, value, current, previous, icon: Icon, inverse = false, href }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-neutral-500">{label}</p>
        <span className="metric-orb inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--clinic-primary)]"><Icon size={19} /></span>
      </div>
      <strong className="mt-5 block text-2xl font-black text-neutral-950">{value}</strong>
      <div className="mt-2"><Comparison current={current} previous={previous} inverse={inverse} /></div>
    </>
  );
  const className = "premium-panel block min-w-0 rounded-lg p-5 transition hover:-translate-y-0.5";
  return href ? <Link href={href} className={className}>{content}</Link> : <section className={className}>{content}</section>;
}

function Panel({ title, description, children, className = "" }) {
  return (
    <section className={`premium-panel min-w-0 rounded-lg p-5 ${className}`}>
      <div>
        <h2 className="text-lg font-black text-neutral-950">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-neutral-500">{description}</p> : null}
      </div>
      <div className="mt-5 min-w-0">{children}</div>
    </section>
  );
}

function ChartTooltip({ active, payload, label, moneyFields = [] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1 font-bold text-neutral-900">{label}</p>
      {payload.map((item) => <p key={item.dataKey} style={{ color: item.color }}>{item.name}: {moneyFields.includes(item.dataKey) ? money(item.value) : number(item.value)}</p>)}
    </div>
  );
}

function RevenueChart({ rows }) {
  const data = rows.map((item) => ({ ...item, label: new Date(`${item.data}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }) }));
  return (
    <div className="h-80 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="biReceived" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--clinic-primary)" stopOpacity={0.45} /><stop offset="1" stopColor="var(--clinic-primary)" stopOpacity={0.02} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="#e5e5e5" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#737373" }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: "#737373" }} axisLine={false} tickLine={false} tickFormatter={compactMoney} />
          <Tooltip content={<ChartTooltip moneyFields={["previsto", "recebido"]} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="previsto" name="Previsto" stroke="#a3a3a3" fill="transparent" strokeDasharray="5 5" strokeWidth={2} />
          <Area type="monotone" dataKey="recebido" name="Recebido" stroke="var(--clinic-primary)" fill="url(#biReceived)" strokeWidth={3} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RankingChart({ rows, nameKey = "nome", valueKey = "recebido", valueName = "Recebido", moneyValue = true }) {
  const data = rows.slice(0, 10).map((item) => ({ ...item, shortName: String(item[nameKey] || "Sem identificação").slice(0, 28) }));
  return (
    <div className="h-[360px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 14, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="#e5e5e5" horizontal={false} />
          <XAxis type="number" tickFormatter={moneyValue ? compactMoney : number} tick={{ fontSize: 11, fill: "#737373" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="shortName" width={118} tick={{ fontSize: 11, fill: "#525252" }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip moneyFields={moneyValue ? [valueKey] : []} />} />
          <Bar dataKey={valueKey} name={valueName} fill="var(--clinic-primary)" radius={[0, 6, 6, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatusChart({ rows }) {
  const data = rows.map((item) => ({ ...item, nome: STATUS_LABELS[item.status] || item.status }));
  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="#e5e5e5" vertical={false} />
          <XAxis dataKey="nome" tick={{ fontSize: 10, fill: "#737373" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#737373" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="quantidade" name="Atendimentos" radius={[6, 6, 0, 0]} maxBarSize={42}>{data.map((item, index) => <Cell key={item.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Funnel({ rows }) {
  const conversionRows = rows.filter((item) => item.status !== "perdido");
  const maximum = Math.max(1, ...conversionRows.map((item) => Number(item.quantidade || 0)));
  return <div className="space-y-3">{conversionRows.map((item, index) => {
    const previous = index > 0 ? Number(conversionRows[index - 1].quantidade || 0) : null;
    const stepRate = previous > 0 ? (Number(item.quantidade || 0) / previous) * 100 : null;
    return <div key={item.status}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="font-bold">{item.nome}</span><span className="text-neutral-500">{number(item.quantidade)}{stepRate == null ? "" : ` · ${percent(stepRate)} da etapa anterior`}</span></div><div className="h-9 overflow-hidden rounded-lg bg-neutral-100"><div className="flex h-full min-w-12 items-center rounded-lg bg-[linear-gradient(90deg,var(--clinic-primary),var(--clinic-accent))] px-3 text-xs font-black text-white transition-all" style={{ width: `${Math.max(8, (Number(item.quantidade || 0) / maximum) * 100)}%` }}>{money(item.valor)}</div></div></div>;
  })}</div>;
}

function EmptyChart({ children = "Ainda não há dados suficientes neste período." }) {
  return <div className="flex min-h-56 items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-5 text-center text-sm text-neutral-500">{children}</div>;
}

function Insights({ insights = [] }) {
  return (
    <Panel title="Sinais de atenção" description="Leituras determinísticas baseadas na variação do período, sem diagnósticos automáticos.">
      {insights.length ? <div className="grid gap-3 lg:grid-cols-2">{insights.map((item) => (
        <div key={item.type} className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="font-bold">{item.title}</p><p className="mt-1 text-sm leading-6">{item.description}</p><p className="mt-2 text-xs font-semibold">Próxima ação: {item.suggestedAction}</p>
        </div>
      ))}</div> : <EmptyChart>Nenhuma variação relevante foi detectada para os limites atuais.</EmptyChart>}
    </Panel>
  );
}

export function BIDashboard({ data, terminology }) {
  const [area, setArea] = useState("geral");
  const current = data.atual || {};
  const previous = data.anterior || {};
  const patientLabel = terminology?.patientPlural || "Pacientes";
  const metrics = [
    { label: "Receita recebida", value: money(current.recebido), current: current.recebido, previous: previous.recebido, icon: CircleDollarSign },
    { label: "Receita prevista", value: money(current.previsto), current: current.previsto, previous: previous.previsto, icon: TrendingUp },
    { label: "Ticket médio", value: money(current.ticket_medio), current: current.ticket_medio, previous: previous.ticket_medio, icon: Target },
    { label: "Atendimentos", value: number(current.atendimentos), current: current.atendimentos, previous: previous.atendimentos, icon: CalendarClock },
    { label: "Ocupação", value: current.taxa_ocupacao == null ? "Não calculada" : percent(current.taxa_ocupacao), current: current.taxa_ocupacao, previous: previous.taxa_ocupacao, icon: Activity },
    { label: "No-show", value: percent(current.taxa_no_show), current: current.taxa_no_show, previous: previous.taxa_no_show, icon: UserRoundCheck, inverse: true, href: "/dashboard/bi/detalhes?tipo=no_show" },
  ];

  return (
    <div>
      <div className="mt-6 overflow-x-auto pb-2">
        <div className="inline-flex min-w-full gap-1 rounded-lg border border-neutral-200 bg-white p-1 shadow-sm sm:min-w-0">
          {AREAS.map(([key, label]) => <button key={key} type="button" onClick={() => setArea(key)} className={`h-10 whitespace-nowrap rounded-md px-4 text-sm font-bold transition ${area === key ? "bg-neutral-950 text-white shadow-lg" : "text-neutral-600 hover:bg-neutral-100"}`}>{label}</button>)}
        </div>
      </div>

      {area === "geral" ? <div className="mt-5 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{metrics.map((item) => <MetricCard key={item.label} {...item} />)}</div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
          <Panel title="Evolução de receita" description="Valores previstos e efetivamente recebidos no período.">{data.timeline?.length ? <RevenueChart rows={data.timeline} /> : <EmptyChart />}</Panel>
          <Panel title="Visão operacional" description="Indicadores que merecem acompanhamento diário.">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between rounded-lg bg-neutral-50 p-3"><span>Pendente</span><strong>{money(current.pendente)}</strong></div>
              <Link href="/dashboard/bi/detalhes?tipo=cancelamentos" className="flex justify-between rounded-lg bg-neutral-50 p-3 transition hover:bg-neutral-100"><span>Cancelamentos</span><strong>{number(current.cancelamentos)}</strong></Link>
              <div className="flex justify-between rounded-lg bg-neutral-50 p-3"><span>Conversão comercial</span><strong>{percent(current.taxa_conversao)}</strong></div>
              <div className="flex justify-between rounded-lg bg-neutral-50 p-3"><span>Pipeline estimado</span><strong>{money(current.pipeline)}</strong></div>
            </div>
          </Panel>
        </div>
        <Insights insights={data.insights} />
      </div> : null}

      {area === "financeiro" ? <div className="mt-5 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard label="Previsto" value={money(current.previsto)} current={current.previsto} previous={previous.previsto} icon={TrendingUp} />
          <MetricCard label="Recebido" value={money(current.recebido)} current={current.recebido} previous={previous.recebido} icon={CircleDollarSign} />
          <MetricCard label="Pendente" value={money(current.pendente)} current={current.pendente} previous={previous.pendente} icon={CalendarClock} inverse />
          <MetricCard label="Ticket médio" value={money(current.ticket_medio)} current={current.ticket_medio} previous={previous.ticket_medio} icon={Target} />
          <MetricCard label="Comissões" value={money(current.comissoes)} current={current.comissoes} previous={previous.comissoes} icon={UsersRound} inverse />
          <MetricCard label="Pagamentos parciais" value={number(current.pagamentos_parciais)} current={current.pagamentos_parciais} previous={previous.pagamentos_parciais} icon={CalendarClock} inverse />
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]"><Panel title="Receita no período" description="Comparação entre valor previsto e recebido.">{data.timeline?.length ? <RevenueChart rows={data.timeline} /> : <EmptyChart />}</Panel><Panel title="Receita por forma de pagamento" description="Somente valores efetivamente recebidos.">{data.receita_forma_pagamento?.length ? <RankingChart rows={data.receita_forma_pagamento} nameKey="forma" valueKey="recebido" valueName="Recebido" /> : <EmptyChart />}</Panel></div>
        <Panel title="Pacotes e sessões" description="Vendas do período e saldo atual das sessões ativas."><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><div className="rounded-lg bg-neutral-50 p-4"><span className="text-xs text-neutral-500">Pacotes vendidos</span><strong className="mt-2 block text-xl">{number(data.pacotes?.vendidos)}</strong></div><div className="rounded-lg bg-neutral-50 p-4"><span className="text-xs text-neutral-500">Valor vendido</span><strong className="mt-2 block text-xl">{money(data.pacotes?.valor_vendido)}</strong></div><div className="rounded-lg bg-neutral-50 p-4"><span className="text-xs text-neutral-500">Sessões vendidas</span><strong className="mt-2 block text-xl">{number(data.pacotes?.sessoes_vendidas)}</strong></div><div className="rounded-lg bg-neutral-50 p-4"><span className="text-xs text-neutral-500">Utilizadas</span><strong className="mt-2 block text-xl">{number(data.pacotes?.sessoes_utilizadas)}</strong></div><div className="rounded-lg bg-neutral-50 p-4"><span className="text-xs text-neutral-500">Restantes</span><strong className="mt-2 block text-xl">{number(data.pacotes?.sessoes_restantes)}</strong></div></div></Panel>
        <Panel title="Rentabilidade" description="Custos fixos, variáveis, despesas e margem exigem o módulo Financeiro 2.0. O BI não inventa esses valores."><EmptyChart>Indicadores de lucro e margem serão habilitados quando houver lançamentos contábeis completos.</EmptyChart></Panel>
      </div> : null}

      {area === "comercial" ? <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <Panel title="Funil comercial" description="Quantidade, potencial e conversão entre etapas.">{data.funil_crm?.length ? <Funnel rows={data.funil_crm} /> : <EmptyChart />}</Panel>
        <Panel title="Origens" description="Leads e conversões por origem capturada.">{data.origens_crm?.length ? <RankingChart rows={data.origens_crm} nameKey="origem" valueKey="leads" valueName="Leads" moneyValue={false} /> : <EmptyChart />}</Panel>
        <MetricCard label="Leads" value={number(current.leads)} current={current.leads} previous={previous.leads} icon={UsersRound} />
        <MetricCard label="Convertidos" value={number(current.convertidos)} current={current.convertidos} previous={previous.convertidos} icon={UserRoundCheck} />
        <MetricCard label="Follow-ups vencidos" value={number(current.followups_vencidos)} current={current.followups_vencidos} previous={previous.followups_vencidos} icon={CalendarClock} inverse />
        <MetricCard label="Tempo até conversão" value={`${Number(current.dias_ate_conversao || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`} current={current.dias_ate_conversao} previous={previous.dias_ate_conversao} icon={Activity} inverse />
        <Link href="/dashboard/bi/detalhes?tipo=leads_perdidos" className="premium-panel rounded-lg p-5 font-bold text-[var(--clinic-primary)]">Abrir leads perdidos</Link>
      </div> : null}

      {area === "agenda" ? <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <Panel title="Status da agenda" description="Distribuição dos atendimentos no período.">{data.agenda_status?.length ? <StatusChart rows={data.agenda_status} /> : <EmptyChart />}</Panel>
        <Panel title="Horários mais procurados" description="Faixas com maior volume de agendamentos.">{data.agenda_horarios?.length ? <RankingChart rows={data.agenda_horarios.map((item) => ({ ...item, nome: `${String(item.hora).padStart(2, "0")}:00` }))} valueKey="quantidade" valueName="Atendimentos" moneyValue={false} /> : <EmptyChart />}</Panel>
        <Panel title="Dias da semana" description="Volume de atendimentos por dia.">{data.agenda_dias_semana?.length ? <RankingChart rows={data.agenda_dias_semana.map((item) => ({ ...item, nome: ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"][Number(item.dia)] }))} valueKey="quantidade" valueName="Atendimentos" moneyValue={false} /> : <EmptyChart />}</Panel>
        <Panel title="Profissionais mais ocupados" description="Minutos faturáveis reservados na agenda.">{data.profissionais?.length ? <RankingChart rows={data.profissionais} valueKey="minutos_ocupados" valueName="Minutos" moneyValue={false} /> : <EmptyChart />}</Panel>
      </div> : null}

      {area === "pacientes" ? <div className="mt-5 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label={`${patientLabel} totais`} value={number(data.pacientes?.total)} current={data.pacientes?.total} previous={data.pacientes?.total} icon={UsersRound} />
          <MetricCard label="Novos no período" value={number(data.pacientes?.novos)} current={current.clientes_novos} previous={previous.clientes_novos} icon={UserRoundCheck} />
          <MetricCard label="Recorrentes" value={number(data.pacientes?.recorrentes)} current={data.pacientes?.recorrentes} previous={0} icon={Activity} />
          <MetricCard label="Sem retorno há 90 dias" value={number(data.pacientes?.sem_retorno_90)} current={data.pacientes?.sem_retorno_90} previous={0} icon={CalendarClock} inverse href="/dashboard/bi/detalhes?tipo=sem_retorno" />
        </div>
        <Panel title={`${patientLabel} por receita`} description="Ranking calculado somente com valores recebidos no período.">{data.pacientes_top?.length ? <RankingChart rows={data.pacientes_top} /> : <EmptyChart />}</Panel>
      </div> : null}

      {area === "procedimentos" ? <div className="mt-5"><Panel title="Procedimentos por receita" description="Ranking baseado em atendimentos do período.">{data.procedimentos?.length ? <RankingChart rows={data.procedimentos} /> : <EmptyChart />}</Panel></div> : null}
      {area === "profissionais" ? <div className="mt-5"><Panel title="Desempenho por profissional" description="Receita recebida por profissional no período.">{data.profissionais?.length ? <RankingChart rows={data.profissionais} /> : <EmptyChart />}</Panel></div> : null}

      {area === "estoque" ? <div className="mt-5 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Produtos ativos" value={number(data.estoque?.skus)} current={data.estoque?.skus} previous={data.estoque?.skus} icon={PackageSearch} />
          <MetricCard label="Valor em custo" value={money(data.estoque?.valor_custo)} current={data.estoque?.valor_custo} previous={data.estoque?.valor_custo} icon={CircleDollarSign} />
          <MetricCard label="Estoque baixo" value={number(data.estoque?.estoque_baixo)} current={data.estoque?.estoque_baixo} previous={0} icon={Activity} inverse />
          <MetricCard label="Estoque zerado" value={number(data.estoque?.estoque_zerado)} current={data.estoque?.estoque_zerado} previous={0} icon={Stethoscope} inverse />
        </div>
        <Panel title="Produtos mais vendidos" description="Receita dos pedidos pagos.">{data.produtos_vendidos?.length ? <RankingChart rows={data.produtos_vendidos} valueKey="receita" valueName="Receita" /> : <EmptyChart />}</Panel>
      </div> : null}

      {area === "ecommerce" ? <div className="mt-5 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Pedidos" value={number(data.ecommerce?.pedidos)} current={data.ecommerce?.pedidos} previous={previous.pedidos} icon={ShoppingBag} />
          <MetricCard label="Receita" value={money(data.ecommerce?.receita)} current={data.ecommerce?.receita} previous={previous.receita_ecommerce} icon={CircleDollarSign} />
          <MetricCard label="Ticket médio" value={money(current.ticket_ecommerce)} current={current.ticket_ecommerce} previous={previous.ticket_ecommerce} icon={Target} />
          <MetricCard label="Carrinhos abandonados" value={number(data.ecommerce?.carrinhos_abandonados)} current={data.ecommerce?.carrinhos_abandonados} previous={0} icon={Activity} inverse />
        </div>
      </div> : null}
    </div>
  );
}
