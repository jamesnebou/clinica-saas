import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/auth/session";
import { EmptyClinicState, Field, PageHeader, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { createAgendamentoAction, deleteAgendamentoAction, updateAgendamentoStatusAction } from "../actions";

export const metadata = { title: "Agenda | Clinica SaaS" };

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function AgendaPage() {
  const { activeClinic } = await requireClinic();

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const supabase = await createClient();
  const [clientesResult, profissionaisResult, procedimentosResult, agendamentosResult] = await Promise.all([
    supabase.from("clientes").select("id, nome, telefone").eq("clinica_id", activeClinic.id).order("nome"),
    supabase.from("profissionais").select("id, nome, especialidade").eq("clinica_id", activeClinic.id).eq("ativo", true).order("nome"),
    supabase.from("procedimentos").select("id, nome, preco, duracao_minutos").eq("clinica_id", activeClinic.id).eq("ativo", true).order("nome"),
    supabase
      .from("agendamentos")
      .select("id, inicio, fim, status, valor, observacoes, clientes(nome), profissionais(nome), procedimentos(nome)")
      .eq("clinica_id", activeClinic.id)
      .order("inicio", { ascending: true })
      .limit(80),
  ]);

  const clientes = clientesResult.data || [];
  const profissionais = profissionaisResult.data || [];
  const procedimentos = procedimentosResult.data || [];
  const agendamentos = agendamentosResult.data || [];

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Agenda" title="Agendamentos" description="MVP de agenda com cliente, profissional, procedimento, horário e status." />

        <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
          <form action={createAgendamentoAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Novo agendamento</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Cliente</span>
                <select name="cliente_id" className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm" required>
                  <option value="">Selecione</option>
                  {clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Profissional</span>
                <select name="profissional_id" className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm" required>
                  <option value="">Selecione</option>
                  {profissionais.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Procedimento</span>
                <select name="procedimento_id" className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm" required>
                  <option value="">Selecione</option>
                  {procedimentos.map((item) => <option key={item.id} value={item.id}>{item.nome} · {formatMoney(item.preco)}</option>)}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Inicio" name="inicio" type="datetime-local" required />
                <Field label="Fim" name="fim" type="datetime-local" required />
              </div>
              <Field label="Valor" name="valor" type="number" defaultValue="0" />
              <TextArea label="Observacoes" name="observacoes" />
              <SubmitButton>Agendar</SubmitButton>
            </div>
          </form>

          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Agenda cadastrada</h2>
            <div className="mt-4 space-y-3">
              {agendamentos.length === 0 ? (
                <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Nenhum agendamento cadastrado.</p>
              ) : agendamentos.map((item) => (
                <article key={item.id} className="rounded-lg border border-neutral-200 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <h3 className="font-semibold">{item.clientes?.nome || "Cliente nao informado"}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{item.procedimentos?.nome || "Procedimento"} com {item.profissionais?.nome || "profissional"}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {new Date(item.inicio).toLocaleString("pt-BR")} - {new Date(item.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {formatMoney(item.valor)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <form action={updateAgendamentoStatusAction} className="flex gap-2">
                        <input type="hidden" name="id" value={item.id} />
                        <select name="status" defaultValue={item.status} className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-sm">
                          <option value="agendado">Agendado</option>
                          <option value="confirmado">Confirmado</option>
                          <option value="em_atendimento">Em atendimento</option>
                          <option value="concluido">Concluido</option>
                          <option value="faltou">Faltou</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                        <button type="submit" className="h-9 rounded-lg border border-neutral-200 px-3 text-sm font-semibold">Salvar</button>
                      </form>
                      <form action={deleteAgendamentoAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="h-9 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700">Excluir</button>
                      </form>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
