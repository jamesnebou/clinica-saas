import Link from "next/link";
import { Building2, CreditCard, LogOut, ShieldAlert, Sparkles, UsersRound } from "lucide-react";
import { requireInternalAdmin } from "@/lib/auth/session";
import { signOutAction } from "@/app/login/actions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Field, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { getClinicUsage, getSystemPlans } from "@/lib/saas/plans";
import { createClinicWithOwnerAction, updateClinicCommercialAction, upsertSystemPlanAction } from "./actions";

export const metadata = { title: "Admin SaaS | Clinica SaaS" };

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateInput(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function limitText(current, limit) {
  return `${current}/${limit}`;
}

function SelectField({ label, name, defaultValue = "", children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <select name={name} defaultValue={defaultValue || ""} className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-600">
        {children}
      </select>
    </label>
  );
}

async function loadClinics() {
  const { data, error } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, email, billing_email, telefone, cidade, estado, status, plano, assinatura_status, trial_ends_at, proxima_cobranca_em, bloqueio_motivo, asaas_customer_id, asaas_subscription_id, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return Promise.all((data || []).map(async (clinic) => ({
    ...clinic,
    usage: await getClinicUsage(clinic.id),
  })));
}

export default async function AdminSaasPage() {
  const user = await requireInternalAdmin();
  const [clinics, plans] = await Promise.all([loadClinics(), getSystemPlans()]);
  const planMap = new Map(plans.map((plan) => [plan.slug, plan]));

  const totalAtivas = clinics.filter((item) => item.status === "ativa" || item.status === "trial").length;
  const inadimplentes = clinics.filter((item) => item.status === "inadimplente").length;
  const receitaPotencial = clinics.reduce((acc, clinic) => acc + Number(planMap.get(clinic.plano)?.preco_mensal || 0), 0);

  const cards = [
    { label: "Clinicas", value: clinics.length, icon: Building2 },
    { label: "Ativas/trial", value: totalAtivas, icon: UsersRound },
    { label: "Inadimplentes", value: inadimplentes, icon: ShieldAlert },
    { label: "MRR potencial", value: formatMoney(receitaPotencial), icon: CreditCard },
  ];

  return (
    <main className="premium-shell min-h-screen text-neutral-950">
      <aside className="fixed inset-x-0 top-0 z-20 border-b border-neutral-200 bg-neutral-950 text-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link href="/admin" className="flex items-center gap-2 text-emerald-300">
            <Sparkles size={19} />
            <span className="text-sm font-bold uppercase tracking-[0.18em]">Admin SaaS</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-neutral-300 sm:inline">{user.email}</span>
            <form action={signOutAction}>
              <input type="hidden" name="next" value="/login" />
              <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm font-semibold text-neutral-200 hover:bg-white/10" type="submit">
                <LogOut size={16} />
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>

      <section className="mx-auto max-w-7xl px-5 pb-10 pt-24 sm:px-8 lg:px-10">
        <div className="border-b border-neutral-200 pb-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Admin interno</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">SaaS comercial</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">Gerencie planos, limites, status de assinatura, cobranca e bloqueio das clinicas. Esta area nao faz parte do dashboard da clinica cliente.</p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between"><p className="text-sm text-neutral-500">{card.label}</p><Icon size={18} className="text-emerald-700" /></div>
                <strong className="mt-2 block text-2xl">{card.value}</strong>
              </article>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_400px]">
          <section className="space-y-4">
            {clinics.length === 0 ? (
              <p className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm">Nenhuma clinica cadastrada.</p>
            ) : clinics.map((clinic) => {
              const plan = planMap.get(clinic.plano) || plans[0];
              return (
                <details key={clinic.id} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold">{clinic.nome}</h2>
                          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold uppercase text-neutral-700">{clinic.status}</span>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase text-emerald-700">{clinic.plano}</span>
                        </div>
                        <p className="mt-2 text-sm text-neutral-500">{clinic.email || clinic.billing_email || "Sem e-mail"} · {clinic.cidade || "Cidade não informada"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-neutral-600 sm:grid-cols-4 lg:min-w-[420px]">
                        <span className="rounded-lg bg-neutral-50 px-3 py-2">Usuarios <b>{limitText(clinic.usage.usuarios, plan?.limite_usuarios || 0)}</b></span>
                        <span className="rounded-lg bg-neutral-50 px-3 py-2">Profissionais <b>{limitText(clinic.usage.profissionais, plan?.limite_profissionais || 0)}</b></span>
                        <span className="rounded-lg bg-neutral-50 px-3 py-2">Clientes <b>{limitText(clinic.usage.clientes, plan?.limite_clientes || 0)}</b></span>
                        <span className="rounded-lg bg-neutral-50 px-3 py-2">Agenda/mês <b>{limitText(clinic.usage.agendamentos_mes, plan?.limite_agendamentos_mes || 0)}</b></span>
                      </div>
                    </div>
                  </summary>

                  <form action={updateClinicCommercialAction} className="mt-5 grid gap-4 rounded-lg bg-neutral-50 p-4 md:grid-cols-3">
                    <input type="hidden" name="clinica_id" value={clinic.id} />
                    <SelectField label="Status" name="status" defaultValue={clinic.status}>
                      <option value="trial">Trial</option>
                      <option value="ativa">Ativa</option>
                      <option value="inadimplente">Inadimplente</option>
                      <option value="cancelada">Cancelada</option>
                    </SelectField>
                    <SelectField label="Plano" name="plano" defaultValue={clinic.plano}>
                      {plans.map((planOption) => <option key={planOption.slug} value={planOption.slug}>{planOption.nome} · {formatMoney(planOption.preco_mensal)}</option>)}
                    </SelectField>
                    <Field label="Fim do trial" name="trial_ends_at" type="date" defaultValue={formatDateInput(clinic.trial_ends_at)} />
                    <Field label="E-mail cobrança" name="billing_email" type="email" defaultValue={clinic.billing_email || clinic.email || ""} />
                    <Field label="Próxima cobrança" name="proxima_cobranca_em" type="date" defaultValue={clinic.proxima_cobranca_em || ""} />
                    <Field label="Asaas customer ID" name="asaas_customer_id" defaultValue={clinic.asaas_customer_id || ""} />
                    <Field label="Asaas subscription ID" name="asaas_subscription_id" defaultValue={clinic.asaas_subscription_id || ""} />
                    <label className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 md:col-span-3">
                      <input type="checkbox" name="isento_cobranca" defaultChecked={clinic.assinatura_status === "isenta"} />
                      Isentar cobrança desta clínica
                    </label>
                    <div className="md:col-span-3"><TextArea label="Motivo de bloqueio/observação" name="bloqueio_motivo" defaultValue={clinic.bloqueio_motivo || ""} /></div>
                    <div className="md:col-span-3"><SubmitButton>Salvar clínica</SubmitButton></div>
                  </form>
                </details>
              );
            })}
          </section>

          <aside className="space-y-6">
            <form action={createClinicWithOwnerAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Criar clinica e owner</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">Cria a clinica, cria ou atualiza o usuario no Supabase Auth e vincula como owner. O acesso nao depende de e-mail chegar.</p>
              <div className="mt-4 space-y-4">
                <Field label="Nome da clinica" name="nome" required />
                <Field label="Slug" name="slug" placeholder="clinica-bella-skin" />
                <Field label="Marca exibida" name="brand_name" placeholder="Bella Skin" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Documento" name="documento" />
                  <Field label="Telefone" name="telefone" />
                  <Field label="Cidade" name="cidade" />
                  <Field label="Estado" name="estado" />
                </div>
                <Field label="E-mail da clinica" name="email" type="email" />
                <Field label="Endereco" name="endereco" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField label="Status inicial" name="status" defaultValue="trial">
                    <option value="trial">Trial</option>
                    <option value="ativa">Ativa</option>
                  </SelectField>
                  <SelectField label="Plano" name="plano" defaultValue="starter">
                    {plans.map((planOption) => <option key={planOption.slug} value={planOption.slug}>{planOption.nome}</option>)}
                  </SelectField>
                </div>
                <div className="rounded-lg bg-neutral-50 p-3">
                  <p className="text-sm font-semibold text-neutral-800">Owner da clinica</p>
                  <div className="mt-3 space-y-4">
                    <Field label="Nome do owner" name="owner_nome" />
                    <Field label="E-mail do owner" name="owner_email" type="email" required />
                    <Field label="Senha temporaria" name="owner_password" type="password" required />
                  </div>
                </div>
                <SubmitButton>Criar clinica</SubmitButton>
              </div>
            </form>

            <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Planos do sistema</h2>
              <div className="mt-4 space-y-3">
                {plans.map((plan) => (
                  <div key={plan.slug} className="rounded-lg border border-neutral-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{plan.nome}</p>
                        <p className="mt-1 text-xs text-neutral-500">{plan.slug} · {formatMoney(plan.preco_mensal)}/mês</p>
                      </div>
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700">{plan.ativo ? "ativo" : "inativo"}</span>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-neutral-600">{plan.limite_usuarios} usuários · {plan.limite_profissionais} profissionais · {plan.limite_clientes} clientes · {plan.limite_agendamentos_mes} agendamentos/mês</p>
                  </div>
                ))}
              </div>
            </section>

            <form action={upsertSystemPlanAction} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Criar ou atualizar plano</h2>
              <div className="mt-4 space-y-4">
                <Field label="Slug" name="slug" placeholder="starter" required />
                <Field label="Nome" name="nome" placeholder="Starter" required />
                <Field label="Preco mensal" name="preco_mensal" type="number" defaultValue="0" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Usuarios" name="limite_usuarios" type="number" defaultValue="3" />
                  <Field label="Profissionais" name="limite_profissionais" type="number" defaultValue="3" />
                  <Field label="Clientes" name="limite_clientes" type="number" defaultValue="300" />
                  <Field label="Agendamentos/mês" name="limite_agendamentos_mes" type="number" defaultValue="500" />
                </div>
                <Field label="Ordem" name="ordem" type="number" defaultValue="0" />
                <TextArea label="Descricao" name="descricao" />
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-700"><input name="ativo" type="checkbox" defaultChecked /> Plano ativo</label>
                <SubmitButton>Salvar plano</SubmitButton>
              </div>
            </form>
          </aside>
        </div>
      </section>
    </main>
  );
}
