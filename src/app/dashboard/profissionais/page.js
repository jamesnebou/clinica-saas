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

function isFaturavel(item) {
  return !["cancelado", "faltou"].includes(item.status) && item.pagamento_status !== "cancelado";
}

function periodMetrics(rows, start, commissionPercent) {
  const periodRows = rows.filter((item) => new Date(item.inicio).toISOString() >= start);
  const previsto = periodRows.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const faturado = periodRows.reduce((acc, item) => acc + Number(item.valor_pago || 0), 0);
  const repasse = (faturado * Number(commissionPercent || 0)) / 100;

  return { previsto, faturado, repasse, quantidade: periodRows.length };
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
      .select("id, profissional_id, inicio, status, valor, valor_pago, pagamento_status, clientes(nome), procedimentos(nome)")
      .eq("clinica_id", activeClinic.id)
      .gte("inicio", ranges.startMonth)
      .lte("inicio", ranges.now),
  ]);

  const metricsByProfessional = new Map();
  for (const profissional of profissionais) {
    const rows = agendamentosFinanceiros
      .filter((item) => item.profissional_id === profissional.id && isFaturavel(item))
      .sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
    const commissionPercent = Number(profissional.comissao_percentual || 0);

    metricsByProfessional.set(profissional.id, {
      rows,
      hoje: periodMetrics(rows, ranges.startDay, commissionPercent),
      semana: periodMetrics(rows, ranges.startWeek, commissionPercent),
      mes: periodMetrics(rows, ranges.startMonth, commissionPercent),
    });
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
                const metrics = metricsByProfessional.get(item.id) || {
                  rows: [],
                  hoje: { previsto: 0, faturado: 0, repasse: 0, quantidade: 0 },
                  semana: { previsto: 0, faturado: 0, repasse: 0, quantidade: 0 },
                  mes: { previsto: 0, faturado: 0, repasse: 0, quantidade: 0 },
                };
                return (
                <details key={item.id} className="rounded-lg border border-neutral-200 p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                      <h3 className="font-semibold">{item.nome}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{item.especialidade || "Sem especialidade"}</p>
                      <p className="mt-1 text-xs text-neutral-500">{item.telefone || "Sem telefone"} - Comissão: {Number(item.comissao_percentual || 0)}%</p>
                        <p className="mt-2 text-xs font-bold text-[var(--clinic-primary)]">Clique para ver faturamento, comissão e atendimentos do mês.</p>
                      </div>
                      <span className="inline-flex h-9 items-center rounded-lg border border-neutral-200 px-3 text-xs font-bold text-neutral-600">Ver detalhes</span>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <span className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">Hoje faturado <b className="block text-sm text-neutral-950">{money(metrics.hoje.faturado)}</b></span>
                      <span className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">Semana faturada <b className="block text-sm text-neutral-950">{money(metrics.semana.faturado)}</b></span>
                      <span className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">Mês faturado <b className="block text-sm text-neutral-950">{money(metrics.mes.faturado)}</b></span>
                      <span className="rounded-lg bg-[color-mix(in_srgb,var(--clinic-accent)_10%,white)] px-3 py-2 text-xs text-neutral-600">Repasse do mês <b className="block text-sm text-neutral-950">{money(metrics.mes.repasse)}</b></span>
                    </div>
                  </summary>

                  <div className="mt-5 border-t border-neutral-200 pt-5">
                    <div className="grid gap-3 md:grid-cols-3">
                      {[
                        ["Hoje", metrics.hoje],
                        ["Semana", metrics.semana],
                        ["Mês", metrics.mes],
                      ].map(([label, data]) => (
                        <div key={label} className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--clinic-primary)]">{label}</p>
                          <div className="mt-3 grid gap-2 text-sm text-neutral-600">
                            <p className="flex justify-between gap-3"><span>Atendimentos</span><strong className="text-neutral-950">{data.quantidade}</strong></p>
                            <p className="flex justify-between gap-3"><span>Previsto</span><strong className="text-neutral-950">{money(data.previsto)}</strong></p>
                            <p className="flex justify-between gap-3"><span>Faturado</span><strong className="text-neutral-950">{money(data.faturado)}</strong></p>
                            <p className="flex justify-between gap-3"><span>Repasse</span><strong className="text-neutral-950">{money(data.repasse)}</strong></p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-lg border border-neutral-200">
                      <div className="border-b border-neutral-200 px-4 py-3">
                        <h4 className="text-sm font-bold text-neutral-950">Atendimentos do mês</h4>
                        <p className="mt-1 text-xs text-neutral-500">O repasse é calculado sobre o valor pago, usando a comissão cadastrada do profissional.</p>
                      </div>
                      <div className="divide-y divide-neutral-200">
                        {metrics.rows.length === 0 ? (
                          <p className="px-4 py-4 text-sm text-neutral-600">Nenhum atendimento faturável neste mês.</p>
                        ) : metrics.rows.map((agendamento) => {
                          const pago = Number(agendamento.valor_pago || 0);
                          const repasse = (pago * Number(item.comissao_percentual || 0)) / 100;
                          return (
                            <div key={agendamento.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_150px_150px_150px] md:items-center">
                              <div>
                                <p className="font-semibold text-neutral-950">{agendamento.clientes?.nome || "Cliente"}</p>
                                <p className="mt-1 text-xs text-neutral-500">{agendamento.procedimentos?.nome || "Procedimento"} - {new Date(agendamento.inicio).toLocaleDateString("pt-BR")}</p>
                              </div>
                              <p className="text-neutral-600">Previsto: <strong className="text-neutral-950">{money(agendamento.valor)}</strong></p>
                              <p className="text-neutral-600">Pago: <strong className="text-neutral-950">{money(pago)}</strong></p>
                              <p className="text-neutral-600">Repasse: <strong className="text-neutral-950">{money(repasse)}</strong></p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap justify-end gap-2">
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
                </details>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
