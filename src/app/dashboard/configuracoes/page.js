import { Clock, MessageCircle, Palette, Settings } from "lucide-react";
import { requireClinicSection } from "@/lib/auth/session";
import { EmptyClinicState, Field, PageHeader, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { updateClinicSettingsAction } from "../actions";

export const metadata = { title: "Configuracoes | Clinica SaaS" };

const weekDays = [
  ["1", "Seg"],
  ["2", "Ter"],
  ["3", "Qua"],
  ["4", "Qui"],
  ["5", "Sex"],
  ["6", "Sab"],
  ["0", "Dom"],
];

function Notice({ children }) {
  return <div className="mt-6 rounded-lg border border-[color-mix(in_srgb,var(--clinic-primary)_24%,#e5e5e5)] bg-[color-mix(in_srgb,var(--clinic-accent)_10%,white)] px-4 py-3 text-sm text-[var(--clinic-primary)]">{children}</div>;
}

export default async function ConfiguracoesPage({ searchParams }) {
  const params = await searchParams;
  const { activeClinic } = await requireClinicSection("configuracoes");

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const meta = activeClinic.metadata || {};
  const schedule = meta.horario_funcionamento || {};
  const selectedDays = Array.isArray(schedule.dias) && schedule.dias.length ? schedule.dias.map(String) : ["1", "2", "3", "4", "5", "6"];

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Clinica" title="Configuracoes da clinica" description="Ajuste dados comerciais, identidade visual, expediente, politica de cancelamento e WhatsApp padrao." />

        {params?.ok === "configuracoes" ? <Notice>Configuracoes atualizadas com sucesso.</Notice> : null}
        {params?.erro ? <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{params?.mensagem || "Nao foi possivel atualizar as configuracoes."}</div> : null}

        <form action={updateClinicSettingsAction} className="mt-8 space-y-6">
          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Settings size={20} className="text-[var(--clinic-primary)]" /><h2 className="text-lg font-semibold">Dados da clinica</h2></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Nome da clinica" name="nome" defaultValue={activeClinic.nome || ""} required />
              <Field label="CNPJ/CPF" name="documento" defaultValue={activeClinic.documento || ""} />
              <Field label="Telefone" name="telefone" defaultValue={activeClinic.telefone || ""} />
              <Field label="E-mail" name="email" type="email" defaultValue={activeClinic.email || ""} />
              <Field label="Endereco" name="endereco" defaultValue={activeClinic.endereco || ""} />
              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <Field label="Cidade" name="cidade" defaultValue={activeClinic.cidade || ""} />
                <Field label="UF" name="estado" defaultValue={activeClinic.estado || ""} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Palette size={20} className="text-[var(--clinic-primary)]" /><h2 className="text-lg font-semibold">Identidade visual</h2></div>
            <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nome da marca" name="brand_name" defaultValue={meta.brand_name || activeClinic.nome || ""} />
                <label className="block">
                  <span className="text-sm font-medium text-neutral-700">Logo da clinica</span>
                  <input name="logo_file" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--clinic-primary)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white focus:border-[var(--clinic-primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--clinic-primary)_18%,transparent)]" />
                  <span className="mt-2 block text-xs leading-5 text-neutral-500">PNG, JPG, WEBP ou SVG. Limite de 30 MB. Ao enviar, a logo atual sera substituida.</span>
                </label>
                <Field label="Cor principal" name="primary_color" defaultValue={meta.primary_color || "#047857"} placeholder="#047857" />
                <Field label="Cor de destaque" name="accent_color" defaultValue={meta.accent_color || "#10b981"} placeholder="#10b981" />
              </div>
              <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
                <div className="h-2" style={{ background: "linear-gradient(90deg, var(--clinic-primary), var(--clinic-accent))" }} />
                <div className="p-4" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--clinic-accent) 12%, white), white)" }}>
                  <div className="flex items-center gap-3">
                    {meta.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={meta.logo_url} alt={`Logo ${activeClinic.nome}`} className="h-11 w-11 rounded-lg object-cover" />
                    ) : <div className="flex h-11 w-11 items-center justify-center rounded-lg text-white" style={{ background: "var(--clinic-primary)" }}><Palette size={19} /></div>}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "var(--clinic-primary)" }}>{meta.brand_name || activeClinic.nome}</p>
                      <p className="mt-1 text-sm font-semibold text-neutral-950">Exemplo do dashboard</p>
                    </div>
                  </div>
                  {meta.logo_storage_path ? <p className="mt-3 truncate rounded-md bg-white/70 px-3 py-2 text-xs text-neutral-500">Storage: {meta.logo_storage_path}</p> : null}
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-white p-3 shadow-sm"><p className="text-xs text-neutral-500">Clientes</p><strong className="mt-1 block text-xl">128</strong></div>
                    <div className="rounded-lg p-3 text-white shadow-sm" style={{ background: "var(--clinic-primary)" }}><p className="text-xs text-white/75">Hoje</p><strong className="mt-1 block text-xl">R$ 890</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Clock size={20} className="text-[var(--clinic-primary)]" /><h2 className="text-lg font-semibold">Horario de funcionamento</h2></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Inicio do expediente" name="expediente_inicio" type="time" defaultValue={schedule.inicio || "08:00"} />
              <Field label="Fim do expediente" name="expediente_fim" type="time" defaultValue={schedule.fim || "18:00"} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {weekDays.map(([value, label]) => (
                <label key={value} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700">
                  <input type="checkbox" name="dias_funcionamento" value={value} defaultChecked={selectedDays.includes(value)} />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><MessageCircle size={20} className="text-[var(--clinic-primary)]" /><h2 className="text-lg font-semibold">Politicas e WhatsApp</h2></div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <TextArea label="Politica de cancelamento" name="politica_cancelamento" defaultValue={meta.politica_cancelamento || ""} placeholder="Ex.: Cancelamentos com menos de 24h podem ser cobrados." />
              <TextArea label="Mensagem padrao de WhatsApp" name="whatsapp_mensagem_padrao" defaultValue={meta.whatsapp_mensagem_padrao || ""} placeholder="Ola, {cliente}. Passando para confirmar seu horario em {data}." />
            </div>
          </section>

          <SubmitButton>Salvar configuracoes</SubmitButton>
        </form>
      </section>
    </main>
  );
}



