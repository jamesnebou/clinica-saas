import { Clock, CreditCard, Mail, MessageCircle, Palette, Settings } from "lucide-react";
import { requireClinicSection } from "@/lib/auth/session";
import { EmptyClinicState, Field, PageHeader, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { updateClinicSettingsAction } from "../actions";
import { ConfigTabs } from "./config-tabs";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Configuracoes | Clinica SaaS" };
export const dynamic = "force-dynamic";

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

function parseDomainNotes(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return { message: value };
  }
}

function dnsHint(domain) {
  const value = String(domain || "").toLowerCase();
  if (value.startsWith("www.")) {
    return "No DNS do cliente, crie um CNAME para www apontando para cname.vercel-dns.com.";
  }
  return "Para dominio raiz, confira na Vercel o registro solicitado. Normalmente sera um A/ALIAS conforme a verificacao do projeto.";
}

function DomainStatusCard({ domain }) {
  const notes = parseDomainNotes(domain.observacoes);
  const status = domain.status || "pendente";
  const ready = ["ativo", "verificado"].includes(status);

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-neutral-950">{domain.dominio}</strong>
        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${ready ? "bg-emerald-100 text-emerald-800" : status === "erro" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
          {ready ? "pronto" : status}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-neutral-600">
        {ready ? "Dominio pronto para abrir o site publico da clinica." : notes?.message || "Aguardando verificacao do dominio na Vercel."}
      </p>
      {!ready ? <p className="mt-2 rounded-md bg-white px-3 py-2 text-xs leading-5 text-neutral-600">{dnsHint(domain.dominio)}</p> : null}
      {Array.isArray(notes?.verification) && notes.verification.length ? (
        <div className="mt-3 space-y-2">
          {notes.verification.map((item, index) => (
            <p key={`${domain.dominio}-${index}`} className="rounded-md bg-white px-3 py-2 text-xs leading-5 text-neutral-600">
              Verificacao Vercel: <strong>{item.type || "DNS"}</strong>{" "}
              {item.domain ? <span>em <strong>{item.domain}</strong>{" "}</span> : null}
              {item.value ? <span>com valor <strong>{item.value}</strong></span> : null}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default async function ConfiguracoesPage({ searchParams }) {
  const params = await searchParams;
  const context = await requireClinicSection("configuracoes");
  const initialClinic = context.activeClinic;

  if (!initialClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const { data: freshClinic } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, documento, telefone, email, endereco, cidade, estado, metadata")
    .eq("id", initialClinic.id)
    .maybeSingle();

  const activeClinic = freshClinic || initialClinic;
  const meta = activeClinic.metadata || {};
  const site = meta.site_publico || {};
  const schedule = meta.horario_funcionamento || {};
  const selectedDays = Array.isArray(schedule.dias) && schedule.dias.length ? schedule.dias.map(String) : ["1", "2", "3", "4", "5", "6"];
  const { data: domains = [] } = await supabaseAdmin
    .from("clinica_dominios")
    .select("dominio, status, observacoes")
    .eq("clinica_id", activeClinic.id)
    .order("created_at", { ascending: false });
  const { data: integration } = await supabaseAdmin
    .from("clinica_integracoes")
    .select("asaas_ativo, asaas_base_url, asaas_api_key, asaas_webhook_token, email_ativo, email_destino, email_remetente, whatsapp_ativo, whatsapp_provider, whatsapp_numero_destino, whatsapp_webhook_url, whatsapp_token")
    .eq("clinica_id", activeClinic.id)
    .maybeSingle();

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Clinica" title="Configuracoes da clinica" description="Ajuste dados comerciais, identidade visual, expediente, politica de cancelamento e WhatsApp padrao." />

        {params?.ok === "configuracoes" ? <Notice>Configuracoes atualizadas com sucesso.</Notice> : null}
        {params?.erro ? <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{params?.mensagem || "Nao foi possivel atualizar as configuracoes."}</div> : null}

        <form action={updateClinicSettingsAction} className="mt-8 space-y-6">
          <ConfigTabs>
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
                  <span className="text-sm font-medium text-neutral-700">Logo da clínica</span>
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
                  {meta.logo_storage_path ? <p className="mt-3 truncate rounded-md bg-white/70 px-3 py-2 text-xs text-neutral-500">Logo Armazenada: {meta.logo_storage_path}</p> : null}
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-white p-3 shadow-sm"><p className="text-xs text-neutral-500">Clientes</p><strong className="mt-1 block text-xl">128</strong></div>
                    <div className="rounded-lg p-3 text-white shadow-sm" style={{ background: "var(--clinic-primary)" }}><p className="text-xs text-white/75">Hoje</p><strong className="mt-1 block text-xl">R$ 890</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Settings size={20} className="text-[var(--clinic-primary)]" /><h2 className="text-lg font-semibold">Site publico de vendas e agendamento</h2></div>
            <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              Link publico atual: <a href={`/c/${activeClinic.slug}`} target="_blank" className="font-bold text-[var(--clinic-primary)] underline">/c/{activeClinic.slug}</a>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700">
                <input type="checkbox" name="site_publicado" defaultChecked={site.publicado !== false} />
                Publicar site e agendamento online
              </label>
              <Field label="Dominio proprio desejado" name="site_dominio" placeholder="www.suaclinica.com.br" defaultValue={domains[0]?.dominio || ""} />
              <Field label="Texto pequeno acima do titulo" name="site_eyebrow" defaultValue={site.eyebrow || ""} placeholder="Estetica premium e atendimento personalizado" />
              <Field label="Titulo principal" name="site_titulo_hero" defaultValue={site.titulo_hero || ""} placeholder="Realce sua beleza com naturalidade" />
              <div className="lg:col-span-2">
                <TextArea label="Subtitulo da pagina" name="site_subtitulo_hero" defaultValue={site.subtitulo_hero || ""} placeholder="Apresente a clinica, diferenciais e convite para agendamento." />
              </div>
              <Field label="Nome da profissional em destaque" name="site_nome_profissional" defaultValue={site.nome_profissional || ""} />
              <Field label="Credencial 1" name="site_credencial_1" defaultValue={site.credencial_1 || ""} placeholder="Protocolos personalizados" />
              <Field label="Credencial 2" name="site_credencial_2" defaultValue={site.credencial_2 || ""} placeholder="Ambiente reservado" />
              <Field label="Credencial 3" name="site_credencial_3" defaultValue={site.credencial_3 || ""} placeholder="Acompanhamento pos-procedimento" />
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Foto principal do site</span>
                <input name="site_hero_image_file" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--clinic-primary)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
                <span className="mt-2 block text-xs leading-5 text-neutral-500">Hero/capa. Recomendado: 1920x1200 px ou maior, horizontal. Limite 50 MB.</span>
                {site.hero_image_url ? <span className="mt-2 block text-xs font-semibold text-[var(--clinic-primary)]">Imagem salva.</span> : null}
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Foto da profissional</span>
                <input name="site_profissional_image_file" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--clinic-primary)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
                <span className="mt-2 block text-xs leading-5 text-neutral-500">Sobre/profissional. Recomendado: 1200x1500 px, vertical. Limite 50 MB.</span>
                {site.profissional_image_url ? <span className="mt-2 block text-xs font-semibold text-[var(--clinic-primary)]">Imagem salva.</span> : null}
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Foto da clinica 1</span>
                <input name="site_clinica_foto_1_file" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--clinic-primary)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
                <span className="mt-2 block text-xs leading-5 text-neutral-500">Galeria principal. Recomendado: 1600x1000 px, horizontal. Limite 50 MB.</span>
                {site.clinica_foto_1 ? <span className="mt-2 block text-xs font-semibold text-[var(--clinic-primary)]">Imagem salva.</span> : null}
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Foto da clinica 2</span>
                <input name="site_clinica_foto_2_file" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--clinic-primary)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
                <span className="mt-2 block text-xs leading-5 text-neutral-500">Galeria lateral. Recomendado: 1200x800 px. Limite 50 MB.</span>
                {site.clinica_foto_2 ? <span className="mt-2 block text-xs font-semibold text-[var(--clinic-primary)]">Imagem salva.</span> : null}
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Foto da clinica 3</span>
                <input name="site_clinica_foto_3_file" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--clinic-primary)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
                <span className="mt-2 block text-xs leading-5 text-neutral-500">Detalhe/ambiente. Recomendado: 1200x800 px. Limite 50 MB.</span>
                {site.clinica_foto_3 ? <span className="mt-2 block text-xs font-semibold text-[var(--clinic-primary)]">Imagem salva.</span> : null}
              </label>
              <Field label="Instagram URL" name="site_instagram_url" defaultValue={site.instagram_url || ""} placeholder="https://instagram.com/..." />
              <Field label="Google Maps URL" name="site_google_maps_url" defaultValue={site.google_maps_url || ""} placeholder="https://maps.google.com/..." />
              <Field label="Avaliacoes Google URL" name="site_google_reviews_url" defaultValue={site.google_reviews_url || ""} placeholder="https://g.page/r/..." />
              <div className="lg:col-span-2">
                <TextArea label="Bio/apresentacao da profissional" name="site_bio_profissional" defaultValue={site.bio_profissional || ""} placeholder="Conte a historia, especialidade, abordagem e autoridade da profissional." />
              </div>
            </div>
            {domains.length ? (
              <div className="mt-5 grid gap-2">
                {domains.map((domain) => (
                  <DomainStatusCard key={domain.dominio} domain={domain} />
                ))}
              </div>
            ) : null}
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

          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><CreditCard size={20} className="text-[var(--clinic-primary)]" /><h2 className="text-lg font-semibold">Integracoes da clinica</h2></div>
            <p className="mt-2 text-sm text-neutral-600">Estas credenciais pertencem somente a esta clinica. Deixe campos sensiveis em branco para manter o valor ja salvo.</p>
            <div className="mt-5 grid gap-5">
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <label className="inline-flex items-center gap-2 text-sm font-bold text-neutral-800">
                  <input type="checkbox" name="asaas_ativo" defaultChecked={Boolean(integration?.asaas_ativo)} />
                  Ativar checkout Asaas desta clinica
                </label>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <Field label="Asaas API URL" name="asaas_base_url" defaultValue={integration?.asaas_base_url || "https://sandbox.asaas.com/api/v3"} />
                  <Field label="Asaas API Key" name="asaas_api_key" type="password" placeholder={integration?.asaas_api_key ? "Chave salva. Preencha apenas para trocar." : "Cole a API key da clinica"} />
                  <Field label="Token do webhook Asaas" name="asaas_webhook_token" type="password" placeholder={integration?.asaas_webhook_token ? "Token salvo. Preencha apenas para trocar." : "Token configurado no webhook da clinica"} />
                </div>
              </div>

              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center gap-2"><Mail size={18} className="text-[var(--clinic-primary)]" /><strong>Notificacao por e-mail</strong></div>
                <label className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-neutral-800">
                  <input type="checkbox" name="email_ativo" defaultChecked={Boolean(integration?.email_ativo)} />
                  Enviar e-mail para novos agendamentos
                </label>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <Field label="E-mail que recebe os avisos" name="email_destino" type="email" defaultValue={integration?.email_destino || activeClinic.email || ""} />
                  <Field label="Remetente" name="email_remetente" defaultValue={integration?.email_remetente || ""} placeholder="Clinica <avisos@seudominio.com.br>" />
                </div>
              </div>

              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center gap-2"><MessageCircle size={18} className="text-[var(--clinic-primary)]" /><strong>Notificacao por WhatsApp</strong></div>
                <label className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-neutral-800">
                  <input type="checkbox" name="whatsapp_ativo" defaultChecked={Boolean(integration?.whatsapp_ativo)} />
                  Enviar WhatsApp para novos agendamentos
                </label>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <Field label="Provider" name="whatsapp_provider" defaultValue={integration?.whatsapp_provider || "zapi"} />
                  <Field label="WhatsApp destino" name="whatsapp_numero_destino" defaultValue={integration?.whatsapp_numero_destino || activeClinic.telefone || ""} placeholder="5577999999999" />
                  <Field label="URL Z-API send-text" name="whatsapp_webhook_url" defaultValue={integration?.whatsapp_webhook_url || ""} placeholder="https://api.z-api.io/instances/.../token/.../send-text" />
                  <Field label="Client-Token Z-API" name="whatsapp_token" type="password" placeholder={integration?.whatsapp_token ? "Token salvo. Preencha apenas para trocar." : "Cole o Client-Token da Z-API"} />
                </div>
              </div>
            </div>
          </section>
          </ConfigTabs>
          <div className="flex justify-end border-t border-neutral-200 pt-6">
            <SubmitButton>Salvar configuracoes</SubmitButton>
          </div>
        </form>
      </section>
    </main>
  );
}








