import Link from "next/link";
import { CalendarDays, CreditCard, Scissors, ShieldCheck, UsersRound } from "lucide-react";
import { requireClinic } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EmptyClinicState, EmptyState, Notice, PageHeader } from "@/components/app-shell/ui";
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

  const [clientes, profissionais, procedimentos, agendamentos, hojeResult, proximosResult] = await Promise.all([
    countRows(supabase, "clientes", activeClinic.id),
    countRows(supabase, "profissionais", activeClinic.id),
    countRows(supabase, "procedimentos", activeClinic.id),
    countRows(supabase, "agendamentos", activeClinic.id),
    supabase.from("agendamentos").select("id, valor, status").eq("clinica_id", activeClinic.id).gte("inicio", dayStart).lt("inicio", dayEnd),
    supabase.from("agendamentos").select("id, inicio, status, valor, clientes(nome), profissionais(nome), procedimentos(nome)").eq("clinica_id", activeClinic.id).gte("inicio", new Date().toISOString()).order("inicio", { ascending: true }).limit(5),
  ]);

  const hoje = hojeResult.data || [];
  const proximos = proximosResult.data || [];
  const faturamentoHoje = hoje.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const faltasHoje = hoje.filter((item) => item.status === "faltou").length;

  const cards = [
    { label: "Clientes", value: clientes, detail: `${plan.limite_clientes || "-"} no plano`, icon: UsersRound },
    { label: "Profissionais", value: profissionais, detail: `${plan.limite_profissionais || "-"} no plano`, icon: UsersRound },
    { label: "Procedimentos", value: procedimentos, detail: "serviços ativos e pacotes", icon: Scissors },
    { label: "Agendamentos", value: agendamentos, detail: "histórico total", icon: CalendarDays },
  ];

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Dashboard" title="Operação da clínica" description={`Visao executiva de ${brandName}: agenda, clientes, equipe, financeiro e status comercial.`} />
        {params?.erro === "permissao" ? (
          <div className="mt-6">
            <Notice type="warning" title="Acesso restrito">Seu papel atual nao tem permissao para abrir essa area. O menu mostra apenas os modulos liberados para o seu acesso.</Notice>
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.label} className="rounded-lg border border-neutral-200 bg-white/95 p-5 shadow-sm">
                  <div className="flex items-center justify-between"><span className="text-sm font-medium text-neutral-500">{card.label}</span><Icon size={20} className="text-[var(--clinic-primary)]" /></div>
                  <strong className="mt-4 block text-3xl font-semibold">{card.value}</strong>
                  <p className="mt-2 text-xs text-neutral-500">{card.detail}</p>
                </article>
              );
            })}
          </section>

          <aside className="rounded-lg border border-neutral-200 bg-white/95 p-5 shadow-sm">
            <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-[var(--clinic-primary)]" /><h2 className="font-semibold">Plano e acesso</h2></div>
            <p className="mt-4 text-2xl font-semibold">{plan.nome || activeClinic.plano}</p>
            <p className="mt-1 text-sm text-neutral-500">{formatMoney(plan.preco_mensal)}/mês · {activeClinic.status}</p>
            <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm leading-6 text-neutral-600">{billingState.message}</p>
          </aside>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-lg border border-neutral-200 bg-white/95 p-5 shadow-sm">
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
          </section>

          <aside className="rounded-lg border border-transparent p-5 text-white shadow-sm" style={{ background: "linear-gradient(135deg, var(--clinic-primary), color-mix(in srgb, var(--clinic-primary) 72%, #111827))" }}>
            <CreditCard size={24} className="text-white/80" />
            <h2 className="mt-4 text-lg font-semibold">Resumo de hoje</h2>
            <div className="mt-4 space-y-3 text-sm text-neutral-300">
              <p className="flex justify-between"><span>Atendimentos</span><strong className="text-white">{hoje.length}</strong></p>
              <p className="flex justify-between"><span>Faturamento previsto</span><strong className="text-white">{formatMoney(faturamentoHoje)}</strong></p>
              <p className="flex justify-between"><span>Faltas</span><strong className="text-white">{faltasHoje}</strong></p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}



