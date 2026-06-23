import { AlertTriangle, Bell, CalendarDays, CheckCircle2, CreditCard, ExternalLink } from "lucide-react";
import { requireClinicSection } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyClinicState, EmptyState, PageHeader } from "@/components/app-shell/ui";
import { markAllNotificationsViewedAction, markNotificationViewedAction } from "./actions";

export const metadata = { title: "Notificacoes | Clinica SaaS" };

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function paymentLabel(status) {
  const value = String(status || "").toLowerCase();
  if (value === "pago") return { label: "Sinal pago", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 };
  if (value === "cancelado") return { label: "Cancelado", className: "border-red-200 bg-red-50 text-red-700", icon: AlertTriangle };
  if (value === "sem_sinal") return { label: "Sem sinal", className: "border-neutral-200 bg-neutral-50 text-neutral-600", icon: CalendarDays };
  return { label: "Pagamento pendente", className: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangle };
}

function NotificationStatus({ status }) {
  const config = paymentLabel(status);
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${config.className}`}>
      <Icon size={13} />
      {config.label}
    </span>
  );
}

async function loadSiteBookings(supabase, clinicId, since) {
  const baseColumns = "id, nome, telefone, email, data_hora, valor_total, valor_sinal, pagamento_status, invoice_url, created_at, procedimentos(nome), profissionais(nome)";
  const query = supabase
    .from("site_agendamentos_publicos")
    .select(`${baseColumns}, visualizado_em`)
    .eq("clinica_id", clinicId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  const { data, error } = await query;
  if (!error) return data || [];

  const fallback = await supabase
    .from("site_agendamentos_publicos")
    .select(baseColumns)
    .eq("clinica_id", clinicId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  return (fallback.data || []).map((item) => ({ ...item, visualizado_em: null, visualizacao_indisponivel: true }));
}

export default async function NotificacoesPage() {
  const { activeClinic } = await requireClinicSection("notificacoes");

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const siteBookings = await loadSiteBookings(supabase, activeClinic.id, since);

  const visualizacaoDisponivel = !siteBookings.some((item) => item.visualizacao_indisponivel);
  const pagos = siteBookings.filter((item) => item.pagamento_status === "pago");
  const pendentes = siteBookings.filter((item) => ["pendente", "erro"].includes(item.pagamento_status));
  const semSinal = siteBookings.filter((item) => item.pagamento_status === "sem_sinal");
  const naoVisualizadas = siteBookings.filter((item) => !item.visualizado_em);
  const recebido = pagos.reduce((acc, item) => acc + Number(item.valor_sinal || 0), 0);
  const pendente = pendentes.reduce((acc, item) => acc + Number(item.valor_sinal || 0), 0);

  const cards = [
    { label: "Novas notificacoes", value: naoVisualizadas.length, detail: "nao visualizadas", icon: Bell },
    { label: "Sinais pagos", value: pagos.length, detail: formatMoney(recebido), icon: CheckCircle2 },
    { label: "Pagamentos pendentes", value: pendentes.length, detail: formatMoney(pendente), icon: AlertTriangle },
    { label: "Sem sinal online", value: semSinal.length, detail: "solicitacoes diretas", icon: CalendarDays },
  ];

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Central"
          title="Notificacoes"
          description="Acompanhe vendas pelo site, agendamentos recebidos, sinais pagos e pendencias de pagamento."
          action={visualizacaoDisponivel && naoVisualizadas.length ? (
            <form action={markAllNotificationsViewedAction}>
              <button type="submit" className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white shadow-sm">
                Marcar todas como visualizadas
              </button>
            </form>
          ) : null}
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-neutral-500">{card.label}</p>
                  <span className="metric-orb inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--clinic-primary)]"><Icon size={19} /></span>
                </div>
                <strong className="mt-4 block text-3xl font-semibold">{card.value}</strong>
                <p className="mt-2 text-xs text-neutral-500">{card.detail}</p>
              </Card>
            );
          })}
        </div>

        <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <CreditCard size={20} className="text-[var(--clinic-primary)]" />
            <h2 className="text-lg font-semibold">Eventos recentes</h2>
          </div>

          <div className="mt-5 space-y-3">
            {siteBookings.length === 0 ? (
              <EmptyState title="Nenhuma notificacao recente" description="Quando o site receber agendamentos ou sinais pagos, eles aparecem aqui." />
            ) : siteBookings.map((item) => (
              <article key={item.id} className="rounded-lg border border-neutral-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{item.nome}</h3>
                      <NotificationStatus status={item.pagamento_status} />
                      {!visualizacaoDisponivel ? null : item.visualizado_em ? (
                        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-bold text-neutral-500">Visualizada</span>
                      ) : (
                        <span className="rounded-full border border-[color-mix(in_srgb,var(--clinic-primary)_22%,#d4d4d4)] bg-[color-mix(in_srgb,var(--clinic-accent)_10%,white)] px-3 py-1 text-xs font-bold text-[var(--clinic-primary)]">Nova</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-neutral-600">
                      {item.procedimentos?.nome || "Procedimento"} com {item.profissionais?.nome || "profissional"}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Agendado para {formatDateTime(item.data_hora)} · recebido em {formatDateTime(item.created_at)}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {item.telefone || "Sem telefone"}{item.email ? ` · ${item.email}` : ""}
                    </p>
                  </div>
                  <div className="text-left lg:text-right">
                    <p className="text-sm font-semibold">{formatMoney(item.valor_total)}</p>
                    <p className="mt-1 text-xs text-neutral-500">Sinal: {formatMoney(item.valor_sinal)}</p>
                    {item.invoice_url ? (
                      <a href={item.invoice_url} target="_blank" className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 px-3 text-xs font-bold text-[var(--clinic-primary)]">
                        Abrir checkout <ExternalLink size={13} />
                      </a>
                    ) : null}
                    {visualizacaoDisponivel && !item.visualizado_em ? (
                      <form action={markNotificationViewedAction} className="mt-2">
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="inline-flex h-9 items-center rounded-lg bg-neutral-950 px-3 text-xs font-bold text-white">
                          Visualizado
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
