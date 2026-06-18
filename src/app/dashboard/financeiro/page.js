import { CreditCard, Package, TrendingUp, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/auth/session";
import { EmptyClinicState, Field, PageHeader, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { createPacoteAction, sellClientePacoteAction, updateAgendamentoFinanceiroAction } from "../actions";

export const metadata = { title: "Financeiro | Clinica SaaS" };

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthRange(month) {
  const safeMonth = /^\d{4}-\d{2}$/.test(month || "") ? month : new Date().toISOString().slice(0, 7);
  const start = new Date(`${safeMonth}-01T00:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { safeMonth, start: start.toISOString(), end: end.toISOString() };
}

function SelectField({ label, name, defaultValue = "", required = false, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <select name={name} defaultValue={defaultValue || ""} required={required} className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-600">
        {children}
      </select>
    </label>
  );
}

export default async function FinanceiroPage({ searchParams }) {
  const params = await searchParams;
  const { safeMonth, start, end } = monthRange(String(params?.month || ""));
  const { activeClinic } = await requireClinic();

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const supabase = await createClient();
  const [agendamentosResult, pagamentosResult, clientesResult, procedimentosResult, pacotesResult, clientePacotesResult] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("id, cliente_id, profissional_id, inicio, valor, valor_pago, pagamento_status, forma_pagamento, clientes(nome), profissionais(nome, comissao_percentual), procedimentos(nome)")
      .eq("clinica_id", activeClinic.id)
      .gte("inicio", start)
      .lt("inicio", end)
      .order("inicio", { ascending: false }),
    supabase
      .from("pagamentos_clinica")
      .select("id, agendamento_id, descricao, valor, valor_pago, status, forma_pagamento, data_pagamento, created_at, clientes(nome), profissionais(nome)")
      .eq("clinica_id", activeClinic.id)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false }),
    supabase.from("clientes").select("id, nome").eq("clinica_id", activeClinic.id).order("nome"),
    supabase.from("procedimentos").select("id, nome").eq("clinica_id", activeClinic.id).eq("ativo", true).order("nome"),
    supabase.from("pacotes_clinica").select("id, nome, quantidade_sessoes, valor, validade_dias, ativo").eq("clinica_id", activeClinic.id).order("created_at", { ascending: false }),
    supabase.from("cliente_pacotes").select("id, nome_pacote, sessoes_total, sessoes_utilizadas, valor_total, status, clientes(nome)").eq("clinica_id", activeClinic.id).order("created_at", { ascending: false }).limit(20),
  ]);

  const agendamentos = agendamentosResult.data || [];
  const pagamentos = pagamentosResult.data || [];
  const clientes = clientesResult.data || [];
  const procedimentos = procedimentosResult.data || [];
  const pacotes = pacotesResult.data || [];
  const clientePacotes = clientePacotesResult.data || [];
  const faturamentoPrevisto = agendamentos.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const recebido = agendamentos.reduce((acc, item) => acc + Number(item.valor_pago || 0), 0) + pagamentos.filter((item) => !item.agendamento_id).reduce((acc, item) => acc + Number(item.valor_pago || 0), 0);
  const pendente = Math.max(0, faturamentoPrevisto - agendamentos.reduce((acc, item) => acc + Number(item.valor_pago || 0), 0));
  const comissoes = agendamentos.reduce((acc, item) => {
    if (item.pagamento_status !== "pago") return acc;
    return acc + (Number(item.valor_pago || item.valor || 0) * Number(item.profissionais?.comissao_percentual || 0)) / 100;
  }, 0);

  const cards = [
    { label: "Previsto no mês", value: formatMoney(faturamentoPrevisto), icon: TrendingUp },
    { label: "Recebido", value: formatMoney(recebido), icon: Wallet },
    { label: "Pendente", value: formatMoney(pendente), icon: CreditCard },
    { label: "Comissões estimadas", value: formatMoney(comissoes), icon: Package },
  ];

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Financeiro" title="Financeiro da clínica" description="Controle básico de pagamentos, faturamento, comissões e pacotes." />

        <form className="mt-6 flex max-w-xs items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm" action="/dashboard/financeiro">
          <Field label="Mês" name="month" type="month" defaultValue={safeMonth} />
          <button className="h-11 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white" type="submit">Filtrar</button>
        </form>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between"><p className="text-sm text-neutral-500">{card.label}</p><Icon size={18} className="text-emerald-700" /></div>
                <strong className="mt-2 block text-2xl">{card.value}</strong>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_420px]">
          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Pagamentos de agendamentos</h2>
            <div className="mt-4 space-y-3">
              {agendamentos.length === 0 ? <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Nenhum atendimento no mês.</p> : agendamentos.map((item) => (
                <details key={item.id} className="rounded-lg border border-neutral-200 p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold">{item.clientes?.nome || "Cliente"}</p>
                        <p className="mt-1 text-sm text-neutral-600">{item.procedimentos?.nome || "Procedimento"} · {new Date(item.inicio).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <div className="text-sm font-semibold text-neutral-700">{formatMoney(item.valor_pago)} / {formatMoney(item.valor)} · {item.pagamento_status}</div>
                    </div>
                  </summary>
                  <form action={updateAgendamentoFinanceiroAction} className="mt-4 grid gap-4 rounded-lg bg-neutral-50 p-3 md:grid-cols-3">
                    <input type="hidden" name="agendamento_id" value={item.id} />
                    <input type="hidden" name="cliente_id" value={item.cliente_id || ""} />
                    <input type="hidden" name="profissional_id" value={item.profissional_id || ""} />
                    <input type="hidden" name="month" value={safeMonth} />
                    <input type="hidden" name="descricao" value={`${item.procedimentos?.nome || "Atendimento"} - ${item.clientes?.nome || "Cliente"}`} />
                    <Field label="Valor" name="valor" type="number" defaultValue={String(item.valor || 0)} />
                    <Field label="Valor pago" name="valor_pago" type="number" defaultValue={String(item.valor_pago || 0)} />
                    <SelectField label="Status" name="pagamento_status" defaultValue={item.pagamento_status || "pendente"}>
                      <option value="pendente">Pendente</option>
                      <option value="parcial">Parcial</option>
                      <option value="pago">Pago</option>
                      <option value="cancelado">Cancelado</option>
                    </SelectField>
                    <SelectField label="Forma" name="forma_pagamento" defaultValue={item.forma_pagamento || ""}>
                      <option value="">Não informado</option>
                      <option value="pix">Pix</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="cartao">Cartão</option>
                      <option value="boleto">Boleto</option>
                      <option value="outro">Outro</option>
                    </SelectField>
                    <Field label="Data pagamento" name="data_pagamento" type="datetime-local" />
                    <TextArea label="Observações" name="observacoes_financeiras" />
                    <div className="md:col-span-3"><SubmitButton>Salvar pagamento</SubmitButton></div>
                  </form>
                </details>
              ))}
            </div>
          </section>

          <aside className="space-y-6">
            <form action={createPacoteAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <input type="hidden" name="month" value={safeMonth} />
              <h2 className="text-lg font-semibold">Criar pacote</h2>
              <div className="mt-4 space-y-4">
                <Field label="Nome" name="nome" required />
                <SelectField label="Procedimento" name="procedimento_id">
                  <option value="">Pacote geral</option>
                  {procedimentos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                </SelectField>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Sessões" name="quantidade_sessoes" type="number" defaultValue="5" />
                  <Field label="Valor" name="valor" type="number" defaultValue="0" />
                  <Field label="Validade dias" name="validade_dias" type="number" defaultValue="90" />
                </div>
                <TextArea label="Descrição" name="descricao" />
                <SubmitButton>Criar pacote</SubmitButton>
              </div>
            </form>

            <form action={sellClientePacoteAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <input type="hidden" name="month" value={safeMonth} />
              <h2 className="text-lg font-semibold">Vender pacote</h2>
              <div className="mt-4 space-y-4">
                <SelectField label="Cliente" name="cliente_id" required><option value="">Selecione</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</SelectField>
                <SelectField label="Pacote" name="pacote_id" required><option value="">Selecione</option>{pacotes.map((item) => <option key={item.id} value={item.id}>{item.nome} · {formatMoney(item.valor)}</option>)}</SelectField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Valor pago" name="valor_pago" type="number" defaultValue="0" />
                  <SelectField label="Forma" name="forma_pagamento"><option value="">Não informado</option><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option><option value="boleto">Boleto</option><option value="outro">Outro</option></SelectField>
                </div>
                <Field label="Data compra" name="data_compra" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                <TextArea label="Observações" name="observacoes" />
                <SubmitButton>Registrar venda</SubmitButton>
              </div>
            </form>

            <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Pacotes vendidos</h2>
              <div className="mt-4 space-y-3">
                {clientePacotes.length === 0 ? <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Nenhum pacote vendido.</p> : clientePacotes.map((item) => (
                  <div key={item.id} className="rounded-lg border border-neutral-200 p-3">
                    <p className="text-sm font-semibold">{item.nome_pacote}</p>
                    <p className="mt-1 text-xs text-neutral-500">{item.clientes?.nome || "Cliente"} · {item.sessoes_utilizadas}/{item.sessoes_total} sessões</p>
                    <p className="mt-1 text-xs text-neutral-500">{formatMoney(item.valor_total)} · {item.status}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

