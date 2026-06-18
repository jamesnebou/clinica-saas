import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, MessageCircle, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireClinic } from "@/lib/auth/session";
import { EmptyClinicState, EmptyState, Field, PageHeader, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { createAgendamentoAction, deleteAgendamentoAction, updateAgendamentoAction, updateAgendamentoStatusAction } from "../actions";

export const metadata = { title: "Agenda | Clinica SaaS" };

const statusConfig = {
  agendado: { label: "Agendado", className: "border-blue-200 bg-blue-50 text-blue-700", icon: Clock },
  confirmado: { label: "Confirmado", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  em_atendimento: { label: "Em atendimento", className: "border-violet-200 bg-violet-50 text-violet-700", icon: Clock },
  concluido: { label: "Concluido", className: "border-neutral-200 bg-neutral-100 text-neutral-700", icon: CheckCircle2 },
  faltou: { label: "Faltou", className: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangle },
  cancelado: { label: "Cancelado", className: "border-red-200 bg-red-50 text-red-700", icon: XCircle },
};

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function onlyDigits(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function whatsappUrl(phone, message) {
  const digits = onlyDigits(phone);
  if (!digits) return "";
  const number = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInput(date);
}

function dayRange(dateString) {
  const start = new Date(`${dateString}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function StatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.agendado;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${config.className}`}>
      <Icon size={13} />
      {config.label}
    </span>
  );
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

export default async function AgendaPage({ searchParams }) {
  const params = await searchParams;
  const selectedDate = String(params?.date || toDateInput(new Date()));
  const selectedProfessional = String(params?.profissional || "");
  const errorMessage = params?.error ? String(params.error) : "";
  const { start, end } = dayRange(selectedDate);
  const { activeClinic } = await requireClinic();

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const supabase = await createClient();
  let agendaQuery = supabase
    .from("agendamentos")
    .select("id, cliente_id, profissional_id, procedimento_id, inicio, fim, status, valor, observacoes, clientes(nome, telefone), profissionais(nome), procedimentos(nome)")
    .eq("clinica_id", activeClinic.id)
    .gte("inicio", start)
    .lt("inicio", end)
    .order("inicio", { ascending: true });

  if (selectedProfessional) {
    agendaQuery = agendaQuery.eq("profissional_id", selectedProfessional);
  }

  const [clientesResult, profissionaisResult, procedimentosResult, agendamentosResult] = await Promise.all([
    supabase.from("clientes").select("id, nome, telefone").eq("clinica_id", activeClinic.id).order("nome"),
    supabase.from("profissionais").select("id, nome, especialidade").eq("clinica_id", activeClinic.id).eq("ativo", true).order("nome"),
    supabase.from("procedimentos").select("id, nome, preco, duracao_minutos").eq("clinica_id", activeClinic.id).eq("ativo", true).order("nome"),
    agendaQuery,
  ]);

  const clientes = clientesResult.data || [];
  const profissionais = profissionaisResult.data || [];
  const procedimentos = procedimentosResult.data || [];
  const agendamentos = agendamentosResult.data || [];
  const faturamentoPrevisto = agendamentos
    .filter((item) => !["cancelado", "faltou"].includes(item.status))
    .reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const faltas = agendamentos.filter((item) => item.status === "faltou").length;
  const concluidos = agendamentos.filter((item) => item.status === "concluido").length;

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Agenda" title="Agenda diária" description="Visão comercial por dia, profissional, status, WhatsApp e edição de horários." />

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-sm text-neutral-500">Atendimentos</p><strong className="mt-2 block text-2xl">{agendamentos.length}</strong></div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-sm text-neutral-500">Faturamento previsto</p><strong className="mt-2 block text-2xl">{formatMoney(faturamentoPrevisto)}</strong></div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-sm text-neutral-500">Concluídos</p><strong className="mt-2 block text-2xl">{concluidos}</strong></div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-sm text-neutral-500">Faltas</p><strong className="mt-2 block text-2xl">{faltas}</strong></div>
        </div>

        <form className="mt-6 flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:flex-row md:items-end" action="/dashboard/agenda">
          <label className="block md:w-52">
            <span className="text-sm font-medium text-neutral-700">Dia</span>
            <input name="date" type="date" defaultValue={selectedDate} className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm" />
          </label>
          <label className="block md:w-72">
            <span className="text-sm font-medium text-neutral-700">Profissional</span>
            <select name="profissional" defaultValue={selectedProfessional} className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm">
              <option value="">Todos os profissionais</option>
              {profissionais.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </select>
          </label>
          <button className="h-11 rounded-lg bg-neutral-950 px-5 text-sm font-semibold text-white" type="submit">Filtrar</button>
          <div className="flex gap-2 md:ml-auto">
            <Link className="inline-flex h-11 items-center rounded-lg border border-neutral-200 px-4 text-sm font-semibold" href={`/dashboard/agenda?date=${addDays(selectedDate, -1)}${selectedProfessional ? `&profissional=${selectedProfessional}` : ""}`}>Anterior</Link>
            <Link className="inline-flex h-11 items-center rounded-lg border border-neutral-200 px-4 text-sm font-semibold" href={`/dashboard/agenda?date=${addDays(selectedDate, 1)}${selectedProfessional ? `&profissional=${selectedProfessional}` : ""}`}>Próximo</Link>
          </div>
        </form>

        {errorMessage ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</div>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
          <form action={createAgendamentoAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <input type="hidden" name="agenda_date" value={selectedDate} />
            <input type="hidden" name="profissional_filtro" value={selectedProfessional} />
            <h2 className="text-lg font-semibold">Novo agendamento</h2>
            <div className="mt-4 space-y-4">
              <SelectField label="Cliente" name="cliente_id" required><option value="">Selecione</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</SelectField>
              <SelectField label="Profissional" name="profissional_id" defaultValue={selectedProfessional} required><option value="">Selecione</option>{profissionais.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</SelectField>
              <SelectField label="Procedimento" name="procedimento_id" required><option value="">Selecione</option>{procedimentos.map((item) => <option key={item.id} value={item.id}>{item.nome} · {formatMoney(item.preco)}</option>)}</SelectField>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Inicio" name="inicio" type="datetime-local" required defaultValue={`${selectedDate}T09:00`} />
                <Field label="Fim" name="fim" type="datetime-local" required defaultValue={`${selectedDate}T10:00`} />
              </div>
              <Field label="Valor" name="valor" type="number" defaultValue="0" />
              <TextArea label="Observacoes" name="observacoes" />
              <SubmitButton>Agendar</SubmitButton>
            </div>
          </form>

          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Atendimentos do dia</h2>
            <div className="mt-4 space-y-3">
              {agendamentos.length === 0 ? (
                <EmptyState title="Agenda livre neste dia" description="Crie um atendimento para demonstrar confirmação, status visual, WhatsApp rápido e faturamento previsto." />
              ) : agendamentos.map((item) => {
                const whats = whatsappUrl(item.clientes?.telefone, `Olá, ${item.clientes?.nome || "tudo bem"}? Passando para confirmar seu horário na clínica em ${new Date(item.inicio).toLocaleString("pt-BR")}.`);
                return (
                  <article key={item.id} className="rounded-lg border border-neutral-200 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.clientes?.nome || "Cliente nao informado"}</h3><StatusBadge status={item.status} /></div>
                        <p className="mt-1 text-sm text-neutral-600">{item.procedimentos?.nome || "Procedimento"} com {item.profissionais?.nome || "profissional"}</p>
                        <p className="mt-1 text-xs text-neutral-500">{new Date(item.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} - {new Date(item.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {formatMoney(item.valor)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {whats ? <a className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 px-3 text-sm font-semibold text-emerald-700" href={whats} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a> : null}
                        <form action={updateAgendamentoStatusAction} className="flex gap-2">
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="agenda_date" value={selectedDate} />
                          <input type="hidden" name="profissional_filtro" value={selectedProfessional} />
                          <select name="status" defaultValue={item.status} className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-sm">
                            {Object.entries(statusConfig).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
                          </select>
                          <button type="submit" className="h-9 rounded-lg border border-neutral-200 px-3 text-sm font-semibold">Salvar</button>
                        </form>
                      </div>
                    </div>

                    <details className="mt-4 rounded-lg bg-neutral-50 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-neutral-700">Editar agendamento</summary>
                      <form action={updateAgendamentoAction} className="mt-4 grid gap-4">
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="agenda_date" value={selectedDate} />
                        <input type="hidden" name="profissional_filtro" value={selectedProfessional} />
                        <div className="grid gap-4 md:grid-cols-3">
                          <SelectField label="Cliente" name="cliente_id" defaultValue={item.cliente_id} required><option value="">Selecione</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}</SelectField>
                          <SelectField label="Profissional" name="profissional_id" defaultValue={item.profissional_id} required><option value="">Selecione</option>{profissionais.map((profissional) => <option key={profissional.id} value={profissional.id}>{profissional.nome}</option>)}</SelectField>
                          <SelectField label="Procedimento" name="procedimento_id" defaultValue={item.procedimento_id} required><option value="">Selecione</option>{procedimentos.map((procedimento) => <option key={procedimento.id} value={procedimento.id}>{procedimento.nome}</option>)}</SelectField>
                        </div>
                        <div className="grid gap-4 md:grid-cols-4">
                          <Field label="Inicio" name="inicio" type="datetime-local" defaultValue={toDatetimeLocal(item.inicio)} required />
                          <Field label="Fim" name="fim" type="datetime-local" defaultValue={toDatetimeLocal(item.fim)} required />
                          <Field label="Valor" name="valor" type="number" defaultValue={String(item.valor || 0)} />
                          <SelectField label="Status" name="status" defaultValue={item.status}>{Object.entries(statusConfig).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</SelectField>
                        </div>
                        <TextArea label="Observacoes" name="observacoes" defaultValue={item.observacoes || ""} />
                        <div className="flex flex-wrap gap-2">
                          <SubmitButton>Salvar edição</SubmitButton>
                        </div>
                      </form>
                      <form action={deleteAgendamentoAction} className="mt-3">
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="agenda_date" value={selectedDate} />
                        <input type="hidden" name="profissional_filtro" value={selectedProfessional} />
                        <button type="submit" className="h-10 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700">Excluir agendamento</button>
                      </form>
                    </details>
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


