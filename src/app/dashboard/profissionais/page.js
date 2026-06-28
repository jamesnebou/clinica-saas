import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireClinicSection } from "@/lib/auth/session";
import { EmptyClinicState, EmptyState, Field, PageHeader, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { createProfissionalAction, deleteProfissionalAction, toggleProfissionalAction } from "../actions";

export const metadata = { title: "Profissionais | Clínica SaaS" };

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function periodRanges() {
  const now = new Date();
  const startDay = new Date(now);
  startDay.setHours(0, 0, 0, 0);
  const startWeek = new Date(startDay);
  startWeek.setDate(startWeek.getDate() - startWeek.getDay());
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDay: startDay.toISOString(), startWeek: startWeek.toISOString(), startMonth: startMonth.toISOString(), now: now.toISOString() };
}

export default async function ProfissionaisPage({ searchParams }) {
  const params = await searchParams;
  const { activeClinic } = await requireClinicSection("profissionais");

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const supabase = await createClient();
  const ranges = periodRanges();
  const [{ data: profissionais = [] }, { data: agendamentosFinanceiros = [] }] = await Promise.all([
    supabase
      .from("profissionais")
      .select("id, nome, telefone, email, especialidade, comissao_percentual, ativo, observacoes")
      .eq("clinica_id", activeClinic.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("agendamentos")
      .select("id, profissional_id, inicio, status, valor, valor_pago, pagamento_status")
      .eq("clinica_id", activeClinic.id)
      .gte("inicio", ranges.startMonth)
      .lte("inicio", ranges.now),
  ]);

  const metricsByProfessional = new Map();
  for (const profissional of profissionais) {
    const rows = agendamentosFinanceiros.filter((item) => item.profissional_id === profissional.id && !["cancelado", "faltou"].includes(item.status) && item.pagamento_status !== "cancelado");
    const sumFrom = (start) => rows.filter((item) => new Date(item.inicio).toISOString() >= start).reduce((acc, item) => acc + Number(item.valor_pago || item.valor || 0), 0);
    const hoje = sumFrom(ranges.startDay);
    const semana = sumFrom(ranges.startWeek);
    const mes = sumFrom(ranges.startMonth);
    const comissao = (mes * Number(profissional.comissao_percentual || 0)) / 100;
    metricsByProfessional.set(profissional.id, { hoje, semana, mes, comissao });
  }

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Equipe" title="Profissionais" description="Cadastre especialistas, comissões e status de atendimento." />

        {params?.erro === "limite" ? (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Limite do plano atingido</p>
            <p className="mt-1 leading-6">{params?.mensagem || "Seu plano atual chegou ao limite de profissionais cadastrados."}</p>
            <Link href="/dashboard/assinatura" className="mt-3 inline-flex h-10 items-center rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white">Ver opções de upgrade</Link>
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
          <form action={createProfissionalAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Novo profissional</h2>
            <div className="mt-4 space-y-4">
              <Field label="Nome" name="nome" required />
              <Field label="Telefone" name="telefone" />
              <Field label="E-mail" name="email" type="email" />
              <Field label="Especialidade" name="especialidade" placeholder="Esteticista, biomédica, fisioterapeuta..." />
              <Field label="Comissão (%)" name="comissao_percentual" type="number" defaultValue="0" />
              <TextArea label="Observações" name="observacoes" />
              <SubmitButton>Cadastrar profissional</SubmitButton>
            </div>
          </form>

          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Equipe cadastrada</h2>
            <div className="mt-4 space-y-3">
              {profissionais.length === 0 ? (
                <EmptyState title="Equipe ainda não cadastrada" description="Inclua profissionais para filtrar a agenda, calcular comissões e evitar conflitos de horário." />
              ) : profissionais.map((item) => {
                const metrics = metricsByProfessional.get(item.id) || { hoje: 0, semana: 0, mes: 0, comissao: 0 };
                return (
                <article key={item.id} className="rounded-lg border border-neutral-200 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <h3 className="font-semibold">{item.nome}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{item.especialidade || "Sem especialidade"}</p>
                      <p className="mt-1 text-xs text-neutral-500">{item.telefone || "Sem telefone"} - Comissão: {Number(item.comissao_percentual || 0)}%</p>
                      <div className="mt-4 grid gap-2 sm:grid-cols-4">
                        <span className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">Hoje <b className="block text-sm text-neutral-950">{money(metrics.hoje)}</b></span>
                        <span className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">Semana <b className="block text-sm text-neutral-950">{money(metrics.semana)}</b></span>
                        <span className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">Mês <b className="block text-sm text-neutral-950">{money(metrics.mes)}</b></span>
                        <span className="rounded-lg bg-[color-mix(in_srgb,var(--clinic-accent)_10%,white)] px-3 py-2 text-xs text-neutral-600">Repasse <b className="block text-sm text-neutral-950">{money(metrics.comissao)}</b></span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <form action={toggleProfissionalAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="ativo" value={item.ativo ? "false" : "true"} />
                        <button type="submit" className="h-9 rounded-lg border border-neutral-200 px-3 text-sm font-semibold">
                          {item.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                      <form action={deleteProfissionalAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="h-9 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700">Excluir</button>
                      </form>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
