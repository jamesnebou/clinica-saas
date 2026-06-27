import Link from "next/link";
import { CalendarDays, CreditCard, Scissors, ShieldCheck, TrendingUp, UsersRound, Wallet } from "lucide-react";
import { requireClinic } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyClinicState, EmptyState, Notice, PageHeader } from "@/components/app-shell/ui";
import { getClinicBillingState, getClinicPlan } from "@/lib/saas/plans";

async function countRows(supabase, table, clinicaId) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("clinica_id", clinicaId);
  if (error) {
    console.error(`Erro ao contar ${table}:`, error);
    return 0;
  }
  return count || 0;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatShortMoney(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000) return `R$ ${(number / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return formatMoney(number);
}

function dayLabel(date) {
  return date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

function buildLastDays(days = 7) {
  const today = new Date();
  return Array.from({ length: days }).map((_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - index));
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    return {
      key: date.toISOString().slice(0, 10),
      label: dayLabel(date),
      start: date.toISOString(),
      end: next.toISOString(),
      previsto: 0,
      recebido: 0,
      atendimentos: 0,
    };
  });
}

function statusLabel(status) {
  const labels = {
    agendado: "Agendado",
    confirmado: "Confirmado",
    em_atendimento: "Em atendimento",
    concluido: "Concluído",
    faltou: "Faltou",
    cancelado: "Cancelado",
  };
  return labels[status] || status || "Sem status";
}

export default async function DashboardPage({ searchParams }) {
  const params = await searchParams;
  const { activeClinic } = await requireClinic();

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const supabase = await createClient();
  const brandName = activeClinic.metadata?.brand_name || activeClinic.nome;
  const plan = await getClinicPlan(activeClinic);
  const billingState = getClinicBillingState(activeClinic);
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const days = buildLastDays(7);
  const chartStart = days[0].start;
  const chartEnd = days[days.length - 1].end;

  const [clientes, profissionais, procedimentos, agendamentos, hojeResult, periodoResult, proximosResult, siteBookingsResult] = await Promise.all([
    countRows(supabase, "clientes", activeClinic.id),
    countRows(supabase, "profissionais", activeClinic.id),
    countRows(supabase, "procedimentos", activeClinic.id),
    countRows(supabase, "agendamentos", activeClinic.id),
    supabase.from("agendamentos").select("id, valor, valor_pago, status").eq("clinica_id", activeClinic.id).gte("inicio", dayStart).lt("inicio", dayEnd),
    supabase.from("agendamentos").select("id, inicio, valor, valor_pago, pagamento_status, status").eq("clinica_id", activeClinic.id).gte("inicio", chartStart).lt("inicio", chartEnd),
    supabase.from("agendamentos").select("id, inicio, status, valor, clientes(nome), profissionais(nome), procedimentos(nome)").eq("clinica_id", activeClinic.id).gte("inicio", new Date().toISOString()).order("inicio", { ascending: true }).limit(5),
    supabase.from("site_agendamentos_publicos").select("id, nome, telefone, data_hora, valor_sinal, pagamento_status, invoice_url").eq("clinica_id", activeClinic.id).gte("created_at", chartStart).order("created_at", { ascending: false }).limit(8),
  ]);

  const hoje = hojeResult.data || [];
  const periodo = periodoResult.data || [];
  const proximos = proximosResult.data || [];
  const siteBookings = siteBookingsResult.data || [];
  const pendingSiteBookings = siteBookings.filter((item) => ["pendente", "erro"].includes(item.pagamento_status));
  const isFaturavel = (item) => !["cancelado", "faltou"].includes(item.status) && item.pagamento_status !== "cancelado";
  const hojeFaturavel = hoje.filter(isFaturavel);
  const periodoFaturavel = período.filter(isFaturavel);

  const dayMap = new Map(days.map((item) => [item.key, item]));
  for (const item of periodo) {
    const key = new Date(item.inicio).toISOString().slice(0, 10);
    const row = dayMap.get(key);
    if (!row) continue;
    if (isFaturavel(item)) {
      row.previsto += Number(item.valor || 0);
      row.recebido += Number(item.valor_pago || 0);
    }
    row.atendimentos += 1;
  }

  const maxChart = Math.max(1, ...days.map((item) => Math.max(item.previsto, item.recebido)));
  const faturamentoHoje = hojeFaturavel.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const recebidoHoje = hojeFaturavel.reduce((acc, item) => acc + Number(item.valor_pago || 0), 0);
  const pendenteHoje = Math.max(0, faturamentoHoje - recebidoHoje);
  const faltasHoje = hoje.filter((item) => item.status === "faltou").length;
  const recebidoPeriodo = periodoFaturavel.reduce((acc, item) => acc + Number(item.valor_pago || 0), 0);
  const previstoPeriodo = periodoFaturavel.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const pendentePeriodo = Math.max(0, previstoPeriodo - recebidoPeriodo);
  const statusCounts = período.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const statusRows = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
  const totalStatus = Math.max(1, statusRows.reduce((acc, [, value]) => acc + value, 0));

  const cards = [
    { label: "Clientes", value: clientes, detail: `${plan.limite_clientes || "-"} no plano`, icon: UsersRound },
    { label: "Profissionais", value: profissionais, detail: `${plan.limite_profissionais || "-"} no plano`, icon: UsersRound },
    { label: "Procedimentos", value: procedimentos, detail: "serviços ativos e pacotes", icon: Scissors },
    { label: "Agendamentos", value: agendamentos, detail: "histórico total", icon: CalendarDays },
  ];

  const financeCards = [
    { label: "Recebido hoje", value: formatMoney(recebidoHoje), icon: Wallet, detail: `${formatMoney(faturamentoHoje)} previsto` },
    { label: "Pendente hoje", value: formatMoney(pendenteHoje), icon: CreditCard, detail: `${hoje.length} atendimentos hoje` },
    { label: "Recebido 7 dias", value: formatMoney(recebidoPeriodo), icon: TrendingUp, detail: `${formatMoney(pendentePeriodo)} pendente` },
  ];

  return (
    <main className="min-w-0 overflow-x-hidden px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
      <section className="mx-auto max-w-7xl min-w-0">
        <PageHeader eyebrow="Dashboard" title="Operação da clínica" description={`Visão executiva de ${brandName}: faturamento, agenda, clientes, equipe e status comercial.`} />
        {params?.erro === "permissao" ? (
          <div className="mt-6">
            <Notice type="warning" title="Acesso restrito">Seu papel atual nao tem permissao para abrir essa area. O menu mostra apenas os modulos liberados para o seu acesso.</Notice>
          </div>
        ) : null}

        {siteBookings.length ? (
          <div className="mt-6">
            <Notice type={pendingSiteBookings.length ? "warning" : "success"} title="Agendamentos pelo site">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <p>
                  {siteBookings.length} solicitação(ões) pelo site nos últimos 7 dias.
                  {pendingSiteBookings.length ? ` ${pendingSiteBookings.length} ainda com sinal pendente.` : " Nenhum sinal pendente no período."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/dashboard/agenda" className="inline-flex h-9 items-center rounded-lg bg-neutral-950 px-3 text-xs font-bold text-white">Abrir agenda</Link>
                  <Link href="/dashboard/financeiro" className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3 text-xs font-bold text-neutral-900">Ver financeiro</Link>
                </div>
              </div>
            </Notice>
          </div>
        ) : null}

        <div className="mt-8 grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.label}>
                  <div className="flex items-center justify-between"><span className="text-sm font-medium text-neutral-500">{card.label}</span><span className="metric-orb inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--clinic-primary)]"><Icon size={20} /></span></div>
                  <strong className="mt-4 block text-3xl font-semibold">{card.value}</strong>
                  <p className="mt-2 text-xs text-neutral-500">{card.detail}</p>
                </Card>
              );
            })}
          </section>

          <Card>
            <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-[var(--clinic-primary)]" /><h2 className="font-semibold">Plano e acesso</h2></div>
            <p className="mt-4 text-2xl font-semibold">{plan.nome || activeClinic.plano}</p>
            <p className="mt-1 text-sm text-neutral-500">{formatMoney(plan.preco_mensal)}/mês - {activeClinic.status}</p>
            <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm leading-6 text-neutral-600">{billingState.message}</p>
          </Card>
        </div>

        <div className="mt-6 grid min-w-0 gap-4 lg:grid-cols-3">
          {financeCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-neutral-500">{card.label}</p>
                    <strong className="mt-2 block text-2xl font-semibold">{card.value}</strong>
                    <p className="mt-1 text-xs text-neutral-500">{card.detail}</p>
                  </div>
                  <span className="metric-orb inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--clinic-primary)]"><Icon size={20} /></span>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="mt-6 grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="premium-panel-dark min-w-0 overflow-hidden">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--clinic-accent)_72%,white)]">Faturamento</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Últimos 7 dias</h2>
              </div>
              <p className="text-sm text-white/60">Previsto x recebido</p>
            </div>

            <div className="mt-6 flex h-72 min-w-0 items-end gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:gap-3 sm:p-4">
              {days.map((item) => {
                const previstoHeight = Math.max(6, Math.round((item.previsto / maxChart) * 100));
                const recebidoHeight = Math.max(6, Math.round((item.recebido / maxChart) * 100));
                return (
                  <div key={item.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
                    <div className="flex flex-1 items-end justify-center gap-1">
                      <div className="w-full max-w-4 rounded-t-md bg-white/[0.18] sm:max-w-5" style={{ height: `${previstoHeight}%` }} title={`Previsto: ${formatMoney(item.previsto)}`} />
                      <div className="w-full max-w-4 rounded-t-md bg-[linear-gradient(180deg,color-mix(in_srgb,var(--clinic-accent)_72%,white),var(--clinic-primary))] shadow-[0_0_24px_color-mix(in_srgb,var(--clinic-accent)_28%,transparent)] sm:max-w-5" style={{ height: `${recebidoHeight}%` }} title={`Recebido: ${formatMoney(item.recebido)}`} />
                    </div>
                    <div className="text-center">
                      <p className="truncate text-xs font-semibold text-white/70">{item.label}</p>
                      <p className="mt-1 truncate text-[11px] text-white/45">{formatShortMoney(item.recebido)}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/55">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-white/20" /> Previsto</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--clinic-accent)]" /> Recebido</span>
            </div>
          </Card>

          <aside className="min-w-0 space-y-6">
            <Card>
              <CreditCard size={24} className="text-[var(--clinic-primary)]" />
              <h2 className="mt-4 text-lg font-semibold">Resumo de hoje</h2>
              <div className="mt-4 space-y-3 text-sm text-neutral-600">
                <p className="flex justify-between"><span>Atendimentos</span><strong className="text-neutral-950">{hoje.length}</strong></p>
                <p className="flex justify-between"><span>Previsto</span><strong className="text-neutral-950">{formatMoney(faturamentoHoje)}</strong></p>
                <p className="flex justify-between"><span>Recebido</span><strong className="text-neutral-950">{formatMoney(recebidoHoje)}</strong></p>
                <p className="flex justify-between"><span>Faltas</span><strong className="text-neutral-950">{faltasHoje}</strong></p>
              </div>
            </Card>

            <Card>
              <h2 className="text-lg font-semibold">Status da agenda</h2>
              <div className="mt-4 space-y-3">
                {statusRows.length === 0 ? (
                  <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-500">Sem agendamentos no período.</p>
                ) : statusRows.map(([status, value]) => (
                  <div key={status}>
                    <div className="flex justify-between gap-3 text-sm"><span className="text-neutral-600">{statusLabel(status)}</span><strong>{value}</strong></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
                      <div className="h-full rounded-full bg-[var(--clinic-primary)]" style={{ width: `${Math.round((value / totalStatus) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </aside>
        </div>

        <div className="mt-6">
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-semibold">Próximos agendamentos</h2><Link href="/dashboard/agenda" className="text-sm font-semibold text-[var(--clinic-primary)]">Abrir agenda</Link></div>
            <div className="mt-4 space-y-3">
              {proximos.length === 0 ? (
                <EmptyState title="Agenda livre nos próximos horários" description="Cadastre um atendimento para demonstrar status, WhatsApp rápido, faturamento previsto e filtro por profissional." action={<Link href="/dashboard/agenda" className="inline-flex h-10 items-center rounded-lg bg-[var(--clinic-primary)] px-4 text-sm font-semibold text-white">Criar agendamento</Link>} />
              ) : proximos.map((item) => (
                <div key={item.id} className="rounded-lg border border-neutral-200 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.clientes?.nome || "Cliente não informado"}</p><p className="mt-1 text-sm text-neutral-600">{item.procedimentos?.nome || "Procedimento não informado"}</p></div><span className="rounded-full bg-[color-mix(in_srgb,var(--clinic-accent)_10%,white)] px-3 py-1 text-xs font-bold uppercase text-[var(--clinic-primary)]">{item.status}</span></div>
                  <p className="mt-3 text-sm text-neutral-500">{new Date(item.inicio).toLocaleString("pt-BR")} com {item.profissionais?.nome || "profissional não informado"}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}
