import Link from "next/link";
import { CalendarClock, KanbanSquare, MessageCircle, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireClinicSection } from "@/lib/auth/session";
import { Card, EmptyClinicState, EmptyState, Field, LimitNotice, Notice, PageHeader, SectionTitle, SelectField, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { convertCrmOpportunityAction, createCrmOpportunityAction, updateCrmOpportunityAction } from "../actions";

export const metadata = { title: "CRM | Clínica SaaS" };

const statusOptions = [
  ["lead", "Lead"],
  ["avaliacao_marcada", "Avaliação marcada"],
  ["em_negociacao", "Em negociação"],
  ["convertido", "Convertido"],
  ["perdido", "Perdido"],
];

const origemOptions = [
  ["instagram", "Instagram"],
  ["indicacao", "Indicação"],
  ["google", "Google"],
  ["trafego_pago", "Tráfego pago"],
  ["whatsapp", "WhatsApp"],
  ["site", "Site"],
  ["outro", "Outro"],
];

const statusTone = {
  lead: "bg-sky-50 text-sky-800 border-sky-200",
  avaliacao_marcada: "bg-violet-50 text-violet-800 border-violet-200",
  em_negociacao: "bg-amber-50 text-amber-900 border-amber-200",
  convertido: "bg-emerald-50 text-emerald-800 border-emerald-200",
  perdido: "bg-neutral-100 text-neutral-700 border-neutral-200",
};

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "-";
}

function whatsappUrl(phone, name) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const number = digits.startsWith("55") ? digits : `55${digits}`;
  const message = encodeURIComponent(`Olá, ${name}. Tudo bem? Estou entrando em contato pela clínica para falar sobre seu atendimento.`);
  return `https://wa.me/${number}?text=${message}`;
}

export default async function CrmPage({ searchParams }) {
  const params = await searchParams;
  const context = await requireClinicSection("crm");
  const { activeClinic } = context;

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const statusFilter = params?.status || "";
  const supabase = await createClient();
  let query = supabase
    .from("crm_oportunidades")
    .select("id, cliente_id, nome, telefone, email, origem, status, valor_estimado, proxima_acao_em, proxima_acao, observacoes, perdido_motivo, convertido_em, created_at")
    .eq("clinica_id", activeClinic.id)
    .order("created_at", { ascending: false });

  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: oportunidades = [], error } = await query;

  const grouped = statusOptions.map(([status, label]) => ({
    status,
    label,
    items: oportunidades.filter((item) => item.status === status),
  }));

  const totalEstimado = oportunidades.reduce((sum, item) => sum + Number(item.valor_estimado || 0), 0);
  const proximasAcoes = oportunidades.filter((item) => item.proxima_acao_em && !["convertido", "perdido"].includes(item.status)).length;

  return (
    <main className="min-w-0 overflow-x-hidden px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl min-w-0">
        <PageHeader
          eyebrow="CRM"
          title="Pipeline comercial"
          description="Acompanhe leads, avaliações, negociações e conversões da clínica sem misturar com prontuário."
        />

        <div className="mt-6 space-y-3">
          {params?.ok === "oportunidade" ? <Notice type="success">Oportunidade criada com sucesso.</Notice> : null}
          {params?.erro === "limite" ? <LimitNotice resource="clientes" message={params?.mensagem} /> : null}
          {error ? (
            <Notice type="danger" title="CRM ainda não disponível">
              A migration `20260619153000_crm_oportunidades.sql` precisa estar aplicada no Supabase antes de usar esta tela.
            </Notice>
          ) : null}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-neutral-600">Oportunidades</p>
            <p className="mt-2 text-3xl font-semibold">{oportunidades.length}</p>
          </Card>
          <Card>
            <p className="text-sm text-neutral-600">Valor estimado</p>
            <p className="mt-2 text-3xl font-semibold">{formatMoney(totalEstimado)}</p>
          </Card>
          <Card>
            <p className="text-sm text-neutral-600">Follow-ups abertos</p>
            <p className="mt-2 text-3xl font-semibold">{proximasAcoes}</p>
          </Card>
        </div>

        <div className="mt-8 space-y-6">
          <Card>
            <div className="flex items-center gap-2">
              <Plus size={20} className="text-[var(--clinic-primary)]" />
              <h2 className="text-lg font-semibold">Nova oportunidade</h2>
            </div>
            <form action={createCrmOpportunityAction} className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_.85fr_1fr_.8fr_.9fr_.8fr_1.2fr_auto] lg:items-end">
              <Field label="Nome" name="nome" required />
              <Field label="WhatsApp" name="telefone" />
              <Field label="E-mail" name="email" type="email" />
              <SelectField label="Origem" name="origem" defaultValue="whatsapp">
                {origemOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectField>
              <SelectField label="Status" name="status" defaultValue="lead">
                {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectField>
              <Field label="Valor" name="valor_estimado" type="number" defaultValue="0" />
              <Field label="Próxima ação" name="proxima_acao" placeholder="Confirmar avaliação..." />
              <SubmitButton>Criar</SubmitButton>
            </form>
          </Card>

          <section className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
              <div className="flex items-center gap-2">
                <KanbanSquare size={20} className="text-[var(--clinic-primary)]" />
                <h2 className="text-lg font-semibold">Visão por etapa</h2>
              </div>
              <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <SelectField label="Filtrar status" name="status" defaultValue={statusFilter}>
                  <option value="">Todos</option>
                  {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </SelectField>
                <button className="h-11 rounded-lg border border-neutral-200 px-4 text-sm font-semibold" type="submit">Filtrar</button>
              </form>
            </div>

            {oportunidades.length === 0 ? (
              <EmptyState title="Nenhuma oportunidade no CRM" description="Cadastre leads e negociações para visualizar o pipeline comercial por etapa." />
            ) : (
              <div className="-mx-5 overflow-x-auto px-5 pb-3 sm:mx-0 sm:px-0">
                <div className="grid min-w-[1120px] grid-cols-5 gap-3">
                  {grouped.map((group) => (
                    <section key={group.status} className="min-w-0 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="truncate text-sm font-semibold" title={group.label}>{group.label}</h3>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone[group.status]}`}>{group.items.length}</span>
                      </div>

                      <div className="mt-3 space-y-2">
                        {group.items.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-neutral-200 p-3 text-xs leading-5 text-neutral-500">Sem oportunidades.</p>
                        ) : group.items.map((item) => {
                          const wa = whatsappUrl(item.telefone, item.nome);
                          return (
                            <article key={item.id} className="rounded-lg border border-neutral-200 p-3">
                              <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                                <span className={`min-w-0 truncate rounded-full border px-2 py-1 text-[11px] font-semibold ${statusTone[item.status]}`} title={statusOptions.find(([value]) => value === item.status)?.[1] || item.status}>
                                  {statusOptions.find(([value]) => value === item.status)?.[1] || item.status}
                                </span>
                                <div className="flex shrink-0 items-center gap-1">
                                  {item.cliente_id ? (
                                    <Link href={`/dashboard/clientes/${item.cliente_id}`} className="inline-flex h-7 items-center rounded-md border border-neutral-200 px-2 text-[11px] font-semibold">Cliente</Link>
                                  ) : null}
                                  {wa ? (
                                    <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--clinic-primary)_24%,#e5e5e5)] text-[var(--clinic-primary)]" title="WhatsApp">
                                      <MessageCircle size={14} />
                                    </a>
                                  ) : null}
                                </div>
                              </div>
                              <h4 className="truncate text-sm font-semibold" title={item.nome}>{item.nome}</h4>
                              <p className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-neutral-600">
                                <span className="whitespace-nowrap">{item.telefone || "Sem telefone"}</span>
                                {item.email ? <span className="min-w-0 truncate" title={item.email}>{item.email}</span> : null}
                              </p>
                              <p className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-[11px] text-neutral-500">
                                <span className="whitespace-nowrap">{origemOptions.find(([value]) => value === item.origem)?.[1] || item.origem}</span>
                                <span className="whitespace-nowrap">{formatMoney(item.valor_estimado)}</span>
                              </p>
                              {item.proxima_acao_em || item.proxima_acao ? (
                                <p className="mt-2 flex min-w-0 items-center gap-1 text-[11px] font-semibold text-[var(--clinic-primary)]">
                                  <CalendarClock size={12} className="shrink-0" />
                                  <span className="truncate" title={`${formatDate(item.proxima_acao_em)} - ${item.proxima_acao || "Follow-up"}`}>{formatDate(item.proxima_acao_em)} - {item.proxima_acao || "Follow-up"}</span>
                                </p>
                              ) : null}
                              {item.observacoes ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-600">{item.observacoes}</p> : null}

                              <details className="mt-3 rounded-lg bg-neutral-50 px-3 py-2">
                                <summary className="cursor-pointer text-sm font-semibold text-neutral-700">Editar oportunidade</summary>
                                <form action={updateCrmOpportunityAction} className="mt-3 grid gap-3">
                                  <input type="hidden" name="id" value={item.id} />
                                  <input type="hidden" name="status_filtro" value={statusFilter} />
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <SelectField label="Status" name="status" defaultValue={item.status}>
                                      {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                    </SelectField>
                                    <SelectField label="Origem" name="origem" defaultValue={item.origem}>
                                      {origemOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                    </SelectField>
                                  </div>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <Field label="Valor estimado" name="valor_estimado" type="number" defaultValue={item.valor_estimado || 0} />
                                    <Field label="Próxima ação em" name="proxima_acao_em" type="date" defaultValue={item.proxima_acao_em || ""} />
                                  </div>
                                  <TextArea label="Próxima ação" name="proxima_acao" defaultValue={item.proxima_acao || ""} />
                                  <TextArea label="Observações" name="observacoes" defaultValue={item.observacoes || ""} />
                                  <Field label="Motivo da perda" name="perdido_motivo" defaultValue={item.perdido_motivo || ""} />
                                  <div className="flex flex-wrap gap-2">
                                    <SubmitButton>Salvar</SubmitButton>
                                    <button formAction={convertCrmOpportunityAction} className="h-11 rounded-lg border border-[color-mix(in_srgb,var(--clinic-primary)_24%,#e5e5e5)] px-4 text-sm font-semibold text-[var(--clinic-primary)]" type="submit">
                                      Converter em cliente
                                    </button>
                                  </div>
                                </form>
                              </details>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
