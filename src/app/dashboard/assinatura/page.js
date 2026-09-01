import { randomUUID } from "node:crypto";
import { AlertTriangle, CheckCircle2, CreditCard, ReceiptText, ShieldCheck } from "lucide-react";
import { Field, PageHeader, SubmitButton } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { getClinicBillingState, getClinicPlan, getClinicUsage, getLimitRows, getSystemPlans } from "@/lib/saas/plans";
import { filterOperationalCharges } from "@/lib/saas/subscription-lifecycle.mjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cancelSubscriptionAction, pauseSubscriptionAction, startSubscriptionAction, updateBillingEmailAction } from "./actions";

export const metadata = { title: "Assinatura | Clínica SaaS" };

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

async function getBillingRows(clinicaId, currentSubscriptionId) {
  const { data, error } = await supabaseAdmin
    .from("asaas_cobrancas")
    .select("id, asaas_subscription_id, status, valor, vencimento, pago_em, invoice_url, bank_slip_url, created_at")
    .eq("clinica_id", clinicaId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Erro ao carregar cobranças Asaas:", error);
    return [];
  }

  return filterOperationalCharges(data || [], currentSubscriptionId).slice(0, 6);
}

function planButtonState({ plan, currentPlan, assinaturaStatus, hasSubscription, isExempt }) {
  if (isExempt) return { label: "Plano isento", disabled: true };
  if (!hasSubscription || assinaturaStatus === "cancelada") return { label: "Ativar plano", disabled: false };
  if (assinaturaStatus === "pausada") {
    return { label: plan.slug === currentPlan.slug ? "Reativar cobrança" : "Reativar neste plano", disabled: false };
  }
  if (assinaturaStatus === "ativa" && plan.slug === currentPlan.slug) return { label: "Plano atual", disabled: true };
  return { label: "Trocar para este plano", disabled: false };
}

export default async function AssinaturaPage({ searchParams }) {
  const params = await searchParams;
  const { activeClinic } = await requireClinicSection("assinatura");
  const [currentPlan, plans, usage, cobrancas] = await Promise.all([
    getClinicPlan(activeClinic),
    getSystemPlans(),
    getClinicUsage(activeClinic.id),
    getBillingRows(activeClinic.id, activeClinic.asaas_subscription_id),
  ]);
  const billingState = getClinicBillingState(activeClinic);
  const limits = getLimitRows({ plan: currentPlan, usage });
  const latestCharge = cobrancas[0] || null;
  const openCharge = ["cancelada"].includes(String(activeClinic.status || "").toLowerCase()) || ["cancelada", "isenta"].includes(String(activeClinic.assinatura_status || "").toLowerCase())
    ? null
    : isOpenChargeStatus(latestCharge?.status) ? latestCharge : null;
  const assinaturaStatus = String(activeClinic.assinatura_status || "").toLowerCase();
  const hasSubscription = Boolean(activeClinic.asaas_subscription_id);
  const isExempt = assinaturaStatus === "isenta";
  const selectedPlanIntent = String(activeClinic.metadata?.selected_plan_intent || "").toLowerCase();
  const intentPlan = plans.find((plan) => String(plan.slug || "").toLowerCase() === selectedPlanIntent) || null;
  const nextBillingDate = assinaturaStatus === "isenta"
    ? null
    : activeClinic.proxima_cobranca_em || openCharge?.vencimento || latestCharge?.vencimento || null;

  return (
    <main className="min-w-0 w-full px-4 py-8 sm:px-6 lg:px-8">
  <section className="w-full min-w-0 max-w-[1480px] mx-auto">
        <PageHeader
          eyebrow="Assinatura"
          title="Plano, limites e cobrança"
          description="Acompanhe o status comercial da clínica, consumo do plano e ativação de assinatura."
        />

        {params?.ok === "assinatura" ? <Notice type="success">Assinatura enviada ao Asaas e plano ativado no sistema. O webhook manterá a cobrança sincronizada.</Notice> : null}
        {params?.ok === "reactivate" ? <Notice type="success">A cobrança recorrente foi reativada na mesma assinatura Asaas.</Notice> : null}
        {params?.ok === "update" ? <Notice type="success">O plano foi atualizado na assinatura existente. Cobranças já emitidas não foram alteradas.</Notice> : null}
        {params?.ok === "synchronize" ? <Notice type="success">A assinatura já estava ativa e foi sincronizada sem criar uma nova recorrência.</Notice> : null}
        {params?.ok === "pausada" ? <Notice type="success">A recorrência foi pausada. Cobranças já emitidas continuam válidas até serem tratadas.</Notice> : null}
        {params?.ok === "cancelada" ? <Notice type="success">A assinatura foi cancelada definitivamente no Asaas.</Notice> : null}
        {params?.ok === "email" ? <Notice type="success">E-mail de cobrança atualizado.</Notice> : null}
        {params?.erro === "asaas" ? <Notice>O Asaas ainda não está configurado. Defina `ASAAS_API_KEY` e `ASAAS_BASE_URL` na Vercel para ativar planos automaticamente.</Notice> : null}
        {params?.erro === "asaas_api" ? <Notice>{params?.mensagem || "Não foi possível alterar a assinatura no Asaas agora. Confira a chave, ambiente e dados da clínica."}</Notice> : null}
        {params?.erro === "permissao" ? <Notice>{params?.mensagem || "Seu usuário não tem permissão para alterar a assinatura da clínica."}</Notice> : null}
        {["operacao", "duplicadas", "confirmacao"].includes(params?.erro) ? <Notice>{params?.mensagem || "Não foi possível concluir a operação de assinatura."}</Notice> : null}
        {params?.erro === "upgrade" || params?.erro === "clinica" || params?.erro === "email" ? <Notice>{params?.mensagem || "Não foi possível processar esta alteração agora."}</Notice> : null}
        {params?.erro === "plano" ? <Notice>Plano não encontrado ou inativo. Revise os planos no painel interno.</Notice> : null}
        {intentPlan && String(intentPlan.slug).toLowerCase() !== String(currentPlan.slug).toLowerCase() ? <Notice>Você demonstrou interesse no plano <strong>{intentPlan.nome}</strong> durante o cadastro. Revise as condições abaixo antes de ativar a cobrança.</Notice> : null}
        {openCharge ? (
          <Notice>
            Existe uma cobrança de {formatMoney(openCharge.valor)} com vencimento em {formatDate(openCharge.vencimento)} aguardando pagamento. Se ela vencer, o sistema pode ser marcado como inadimplente e novas operações podem ser bloqueadas automaticamente.
          </Notice>
        ) : null}

        <div className="mt-8 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <section className="min-w-0 space-y-6">
            <article className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2 text-[var(--clinic-primary)]"><ShieldCheck size={20} /><p className="text-sm font-bold uppercase tracking-[0.18em]">Status atual</p></div>
                  <h2 className="mt-3 text-3xl font-semibold">{currentPlan.nome}</h2>
                  <p className="mt-2 text-sm text-neutral-600">{formatMoney(currentPlan.preco_mensal)}/mês - status {assinaturaStatus === "isenta" ? "isenta" : activeClinic.status}</p>
                  <p className="mt-4 rounded-lg bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-700">{billingState.message}</p>
                </div>
                <div className="min-w-0 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 lg:min-w-[280px]">
                  <p className="grid gap-1 sm:flex sm:justify-between sm:gap-4"><span>E-mail cobrança</span><strong className="break-all text-neutral-900">{activeClinic.billing_email || activeClinic.email || "-"}</strong></p>
                  <p className="mt-3 grid gap-1 sm:flex sm:justify-between sm:gap-4"><span>Próxima cobrança</span><strong className="text-neutral-900">{assinaturaStatus === "isenta" ? "Isenta" : formatDate(nextBillingDate)}</strong></p>
                  <p className="mt-3 grid gap-1 sm:flex sm:justify-between sm:gap-4"><span>Trial até</span><strong className="text-neutral-900">{formatDate(activeClinic.trial_ends_at)}</strong></p>
                </div>
              </div>
            </article>

            <article className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Uso do plano</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {limits.map((item) => {
                  const percentage = pct(item.used, item.limit);
                  return (
                    <div key={item.label} className="min-w-0 rounded-lg border border-neutral-200 p-4">
                      <div className="flex min-w-0 items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-semibold text-neutral-800">{item.label}</span><span className="text-neutral-500">{item.used}/{item.limit}</span></div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-[var(--clinic-primary)]" style={{ width: `${percentage}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><ReceiptText size={20} className="text-[var(--clinic-primary)]" /><h2 className="text-lg font-semibold">Cobranças recentes</h2></div>
              <div className="mt-4 space-y-3">
                {cobrancas.length === 0 ? (
                  <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Nenhuma cobrança sincronizada ainda. Após ativar pelo Asaas, os eventos do webhook aparecerão aqui.</p>
                ) : cobrancas.map((item) => (
                  <div key={item.id} className="rounded-lg border border-neutral-200 p-4 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{formatMoney(item.valor)} - {item.status}</p><p className="mt-1 text-neutral-500">Vencimento: {formatDate(item.vencimento)} - Pago em: {formatDate(item.pago_em)}</p></div>{item.invoice_url ? <a href={item.invoice_url} target="_blank" className="font-semibold text-[var(--clinic-primary)]">Abrir fatura</a> : null}</div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <aside className="min-w-0 space-y-6">
            <form action={updateBillingEmailAction} className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">E-mail de cobrança</h2>
              <div className="mt-4 space-y-4">
                <Field label="E-mail" name="billing_email" type="email" defaultValue={activeClinic.billing_email || activeClinic.email || ""} required />
                <SubmitButton>Atualizar e-mail</SubmitButton>
              </div>
            </form>

            <section className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><CreditCard size={20} className="text-[var(--clinic-primary)]" /><h2 className="text-lg font-semibold">Ativar ou trocar plano</h2></div>
              <div className="mt-4 space-y-4">
                {plans.map((plan) => {
                  const buttonState = planButtonState({ plan, currentPlan, assinaturaStatus, hasSubscription, isExempt });
                  return (
                  <form key={plan.slug} action={startSubscriptionAction} className={`min-w-0 overflow-hidden rounded-lg border p-4 ${plan.slug === currentPlan.slug ? "border-[color-mix(in_srgb,var(--clinic-primary)_38%,#d4d4d4)] bg-[color-mix(in_srgb,var(--clinic-accent)_10%,white)]" : "border-neutral-200 bg-white"}`}>
                    <input type="hidden" name="plano" value={plan.slug} />
                    <input type="hidden" name="billing_email" value={activeClinic.billing_email || activeClinic.email || ""} />
                    <input type="hidden" name="operation_key" value={randomUUID()} />
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{plan.nome}</h3>
                        <p className="mt-1 text-sm text-neutral-500">{formatMoney(plan.preco_mensal)}/mês</p>
                        <p className="mt-2 break-words text-xs leading-5 text-neutral-600">{plan.limite_usuarios} usuários - {plan.limite_profissionais} profissionais - {plan.limite_clientes} clientes - {plan.limite_agendamentos_mes} agendamentos/mês</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {plan.slug === currentPlan.slug ? <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-[var(--clinic-primary)]">Atual</span> : null}
                        {String(plan.slug).toLowerCase() === selectedPlanIntent ? <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-bold text-[#ed7009]">Escolhido no cadastro</span> : null}
                      </div>
                    </div>
                    <div className="mt-4">
                      <SelectField label="Forma de cobrança" name="billing_type" defaultValue={activeClinic.metadata?.asaas_billing_type || "UNDEFINED"}>
                        <option value="UNDEFINED">Forma de pagamento: Pix, boleto ou cartão</option>
                        <option value="PIX">Pix</option>
                        <option value="BOLETO">Boleto</option>
                        <option value="CREDIT_CARD">Cartão de crédito</option>
                      </SelectField>
                      <p className="mt-2 text-xs leading-5 text-neutral-500">Escolha a melhor forma para o seu pagamento.</p>
                    </div>
                    <button disabled={buttonState.disabled} className="mt-4 h-10 w-full rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500" type="submit">
                      {buttonState.label}
                    </button>
                  </form>
                  );
                })}
              </div>
            </section>

            {hasSubscription && !isExempt ? (
              <section className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Gerenciar recorrência</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">Pausar mantém a assinatura para uma futura reativação. Cancelar definitivamente encerra a recorrência e não pode ser desfeito.</p>
                {assinaturaStatus === "ativa" ? (
                  <form action={pauseSubscriptionAction} className="mt-4">
                    <input type="hidden" name="operation_key" value={randomUUID()} />
                    <button type="submit" className="h-10 w-full rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-100">Pausar cobrança</button>
                  </form>
                ) : null}
                <form action={cancelSubscriptionAction} className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                  <input type="hidden" name="operation_key" value={randomUUID()} />
                  <label className="flex items-start gap-3 text-xs leading-5 text-red-900">
                    <input type="checkbox" name="confirmar_cancelamento" required className="mt-1" />
                    <span>Confirmo que desejo encerrar definitivamente esta assinatura. O Asaas removerá as cobranças pendentes ou vencidas pertencentes à recorrência.</span>
                  </label>
                  <button type="submit" className="mt-3 h-10 w-full rounded-lg bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800">Cancelar assinatura definitivamente</button>
                </form>
              </section>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  );
}
