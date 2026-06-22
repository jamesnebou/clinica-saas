import { AlertTriangle, CheckCircle2, CreditCard, ReceiptText, ShieldCheck } from "lucide-react";
import { requireClinicSection } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Field, PageHeader, SubmitButton } from "@/components/app-shell/ui";
import { getClinicBillingState, getClinicPlan, getClinicUsage, getLimitRows, getSystemPlans } from "@/lib/saas/plans";
import { startSubscriptionAction, updateBillingEmailAction } from "./actions";

export const metadata = { title: "Assinatura | Clinica SaaS" };

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${value}`.includes("T") ? value : `${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function pct(used, limit) {
  if (!limit) return 0;
  return Math.min(100, Math.round((Number(used || 0) / Number(limit || 1)) * 100));
}

function isOpenChargeStatus(status) {
  return ["pending", "pendente", "overdue", "vencido"].includes(String(status || "").toLowerCase());
}

function Notice({ type, children }) {
  const styles = type === "success"
    ? "border-[color-mix(in_srgb,var(--clinic-primary)_24%,#e5e5e5)] bg-[color-mix(in_srgb,var(--clinic-accent)_10%,white)] text-[var(--clinic-primary)]"
    : "border-amber-200 bg-amber-50 text-amber-900";
  const Icon = type === "success" ? CheckCircle2 : AlertTriangle;

  return <div className={`mt-6 flex gap-3 rounded-lg border p-4 text-sm ${styles}`}><Icon size={18} className="mt-0.5 shrink-0" /><p>{children}</p></div>;
}

function SelectField({ label, name, defaultValue = "", children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <select name={name} defaultValue={defaultValue} className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-[var(--clinic-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--clinic-primary)_18%,transparent)]">
        {children}
      </select>
    </label>
  );
}

async function getBillingRows(clinicaId) {
  const { data, error } = await supabaseAdmin
    .from("asaas_cobrancas")
    .select("id, status, valor, vencimento, pago_em, invoice_url, bank_slip_url, created_at")
    .eq("clinica_id", clinicaId)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    console.error("Erro ao carregar cobrancas Asaas:", error);
    return [];
  }

  return data || [];
}

export default async function AssinaturaPage({ searchParams }) {
  const params = await searchParams;
  const { activeClinic } = await requireClinicSection("assinatura");
  const [currentPlan, plans, usage, cobrancas] = await Promise.all([
    getClinicPlan(activeClinic),
    getSystemPlans(),
    getClinicUsage(activeClinic.id),
    getBillingRows(activeClinic.id),
  ]);
  const billingState = getClinicBillingState(activeClinic);
  const limits = getLimitRows({ plan: currentPlan, usage });
  const latestCharge = cobrancas[0] || null;
  const openCharge = ["cancelada", "inativa"].includes(String(activeClinic.status || "").toLowerCase()) || ["cancelada", "isenta"].includes(String(activeClinic.assinatura_status || "").toLowerCase())
    ? null
    : isOpenChargeStatus(latestCharge?.status) ? latestCharge : null;

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Assinatura"
          title="Plano, limites e cobranca"
          description="Acompanhe o status comercial da clinica, consumo do plano e ativacao de assinatura."
        />

        {params?.ok === "assinatura" ? <Notice type="success">Assinatura enviada ao Asaas e plano ativado no sistema. O webhook mantera a cobranca sincronizada.</Notice> : null}
        {params?.ok === "email" ? <Notice type="success">E-mail de cobranca atualizado.</Notice> : null}
        {params?.erro === "asaas" ? <Notice>O Asaas ainda nao esta configurado. Defina `ASAAS_API_KEY` e `ASAAS_BASE_URL` na Vercel para ativar planos automaticamente.</Notice> : null}
        {params?.erro === "asaas_api" ? <Notice>{params?.mensagem || "Nao foi possivel criar a assinatura no Asaas agora. Confira a chave, ambiente e dados da clinica."}</Notice> : null}
        {params?.erro === "permissao" ? <Notice>{params?.mensagem || "Seu usuario nao tem permissao para alterar a assinatura da clinica."}</Notice> : null}
        {params?.erro === "upgrade" || params?.erro === "clinica" || params?.erro === "email" ? <Notice>{params?.mensagem || "Nao foi possivel processar esta alteracao agora."}</Notice> : null}
        {params?.erro === "plano" ? <Notice>Plano nao encontrado ou inativo. Revise os planos no painel interno.</Notice> : null}
        {openCharge ? (
          <Notice>
            Existe uma cobranca de {formatMoney(openCharge.valor)} com vencimento em {formatDate(openCharge.vencimento)} aguardando pagamento. Se ela vencer, o sistema pode ser marcado como inadimplente e novas operacoes podem ser bloqueadas automaticamente.
          </Notice>
        ) : null}

        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_400px]">
          <section className="space-y-6">
            <article className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[var(--clinic-primary)]"><ShieldCheck size={20} /><p className="text-sm font-bold uppercase tracking-[0.18em]">Status atual</p></div>
                  <h2 className="mt-3 text-3xl font-semibold">{currentPlan.nome}</h2>
                  <p className="mt-2 text-sm text-neutral-600">{formatMoney(currentPlan.preco_mensal)}/mes - status {activeClinic.status}</p>
                  <p className="mt-4 rounded-lg bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-700">{billingState.message}</p>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 lg:min-w-[280px]">
                  <p className="flex justify-between gap-4"><span>E-mail cobranca</span><strong className="text-neutral-900">{activeClinic.billing_email || activeClinic.email || "-"}</strong></p>
                  <p className="mt-3 flex justify-between gap-4"><span>Proxima cobranca</span><strong className="text-neutral-900">{formatDate(activeClinic.proxima_cobranca_em)}</strong></p>
                  <p className="mt-3 flex justify-between gap-4"><span>Trial ate</span><strong className="text-neutral-900">{formatDate(activeClinic.trial_ends_at)}</strong></p>
                </div>
              </div>
            </article>

            <article className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Uso do plano</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {limits.map((item) => {
                  const percentage = pct(item.used, item.limit);
                  return (
                    <div key={item.label} className="rounded-lg border border-neutral-200 p-4">
                      <div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-neutral-800">{item.label}</span><span className="text-neutral-500">{item.used}/{item.limit}</span></div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-[var(--clinic-primary)]" style={{ width: `${percentage}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><ReceiptText size={20} className="text-[var(--clinic-primary)]" /><h2 className="text-lg font-semibold">Cobrancas recentes</h2></div>
              <div className="mt-4 space-y-3">
                {cobrancas.length === 0 ? (
                  <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Nenhuma cobranca sincronizada ainda. Apos ativar pelo Asaas, os eventos do webhook aparecerao aqui.</p>
                ) : cobrancas.map((item) => (
                  <div key={item.id} className="rounded-lg border border-neutral-200 p-4 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{formatMoney(item.valor)} - {item.status}</p><p className="mt-1 text-neutral-500">Vencimento: {formatDate(item.vencimento)} - Pago em: {formatDate(item.pago_em)}</p></div>{item.invoice_url ? <a href={item.invoice_url} target="_blank" className="font-semibold text-[var(--clinic-primary)]">Abrir fatura</a> : null}</div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <aside className="space-y-6">
            <form action={updateBillingEmailAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">E-mail de cobranca</h2>
              <div className="mt-4 space-y-4">
                <Field label="E-mail" name="billing_email" type="email" defaultValue={activeClinic.billing_email || activeClinic.email || ""} required />
                <SubmitButton>Atualizar e-mail</SubmitButton>
              </div>
            </form>

            <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><CreditCard size={20} className="text-[var(--clinic-primary)]" /><h2 className="text-lg font-semibold">Ativar ou trocar plano</h2></div>
              <div className="mt-4 space-y-4">
                {plans.map((plan) => (
                  <form key={plan.slug} action={startSubscriptionAction} className={`rounded-lg border p-4 ${plan.slug === currentPlan.slug ? "border-[color-mix(in_srgb,var(--clinic-primary)_38%,#d4d4d4)] bg-[color-mix(in_srgb,var(--clinic-accent)_10%,white)]" : "border-neutral-200 bg-white"}`}>
                    <input type="hidden" name="plano" value={plan.slug} />
                    <input type="hidden" name="billing_email" value={activeClinic.billing_email || activeClinic.email || ""} />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{plan.nome}</h3>
                        <p className="mt-1 text-sm text-neutral-500">{formatMoney(plan.preco_mensal)}/mes</p>
                        <p className="mt-2 text-xs leading-5 text-neutral-600">{plan.limite_usuarios} usuarios - {plan.limite_profissionais} profissionais - {plan.limite_clientes} clientes - {plan.limite_agendamentos_mes} agendamentos/mes</p>
                      </div>
                      {plan.slug === currentPlan.slug ? <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-[var(--clinic-primary)]">Atual</span> : null}
                    </div>
                    <div className="mt-4">
                      <SelectField label="Forma de cobranca" name="billing_type" defaultValue={activeClinic.metadata?.asaas_billing_type || "UNDEFINED"}>
                        <option value="UNDEFINED">Forma de Pagamento: Pix, boleto ou cartao</option>
                        <option value="PIX">Pix</option>
                        <option value="BOLETO">Boleto</option>
                        <option value="CREDIT_CARD">Cartao de credito</option>
                      </SelectField>
                      <p className="mt-2 text-xs leading-5 text-neutral-500">Escolha a melhor forma para o seu pagamento.</p>
                    </div>
                    <button className="mt-4 h-10 w-full rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800" type="submit">
                      {plan.slug === currentPlan.slug && activeClinic.status === "ativa" ? "Reativar cobranca" : "Ativar plano"}
                    </button>
                  </form>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
