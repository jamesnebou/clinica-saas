import { CalendarDays, CheckCircle2, Clock, CreditCard, MapPin, ShieldCheck, Sparkles, Star, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createPublicBookingAction } from "./actions";

export const dynamic = "force-dynamic";

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function depositValue(procedimento) {
  const price = Number(procedimento?.preco || 0);
  const fixed = Number(procedimento?.sinal_valor || 0);
  const percent = Number(procedimento?.sinal_percentual || 0);
  const value = fixed > 0 ? fixed : percent > 0 ? price * (percent / 100) : 0;
  return Math.max(0, Math.min(price, Number(value.toFixed(2))));
}

function safeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function serviceLabel(procedimento) {
  const signal = depositValue(procedimento);
  if (signal <= 0) return "Agendamento sem sinal online";
  return `Sinal de ${money(signal)} no checkout`;
}

function nextSuggestedDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { data } = await supabaseAdmin.from("clinicas").select("nome, metadata").eq("slug", slug).maybeSingle();
  const site = data?.metadata?.site_publico || {};
  return {
    title: `${site.titulo_hero || data?.metadata?.brand_name || data?.nome || "Clinica"} | Agendamento`,
    description: site.subtitulo_hero || "Conheca os procedimentos e agende seu atendimento.",
  };
}

export default async function PublicClinicPage({ params, searchParams }) {
  const { slug } = await params;
  const query = await searchParams;

  const { data: clinic, error } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, telefone, email, endereco, cidade, estado, status, metadata")
    .eq("slug", slug)
    .in("status", ["trial", "ativa"])
    .maybeSingle();

  if (error) throw error;
  if (!clinic) notFound();

  const meta = clinic.metadata || {};
  const site = meta.site_publico || {};
  if (site.publicado === false) notFound();

  const primaryColor = safeColor(meta.primary_color, "#111110");
  const accentColor = safeColor(meta.accent_color, "#f4729a");

  const [{ data: procedimentos = [] }, { data: profissionais = [] }] = await Promise.all([
    supabaseAdmin
      .from("procedimentos")
      .select("id, nome, categoria, descricao, duracao_minutos, preco, cuidados_antes, cuidados_depois, sinal_percentual, sinal_valor, destaque_site, ordem_site")
      .eq("clinica_id", clinic.id)
      .eq("ativo", true)
      .eq("publicado_site", true)
      .order("destaque_site", { ascending: false })
      .order("ordem_site", { ascending: true })
      .order("preco", { ascending: true }),
    supabaseAdmin
      .from("profissionais")
      .select("id, nome, especialidade, observacoes")
      .eq("clinica_id", clinic.id)
      .eq("ativo", true)
      .order("nome", { ascending: true }),
  ]);

  const brandName = meta.brand_name || clinic.nome;
  const logoUrl = meta.logo_url || "";
  const whatsapp = String(clinic.telefone || "").replace(/\D/g, "");
  const schedule = meta.horario_funcionamento || {};
  const defaultProcedure = procedimentos[0];

  return (
    <main
      className="min-h-screen overflow-hidden bg-[#f7f2ed] text-[#14120f]"
      style={{
        "--clinic-primary": primaryColor,
        "--clinic-accent": accentColor,
        background: "radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--clinic-accent) 18%, transparent), transparent 32rem), radial-gradient(circle at 100% 12%, color-mix(in srgb, var(--clinic-primary) 13%, transparent), transparent 30rem), linear-gradient(145deg, #fbf8f3 0%, #f1ece4 50%, #ebe8df 100%)",
      }}
    >
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="#topo" className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`Logo ${brandName}`} className="h-11 w-11 rounded-xl object-contain" />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--clinic-primary)] text-white"><Sparkles size={20} /></span>
          )}
          <span className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--clinic-primary)]">{brandName}</span>
        </a>
        <a href="#agendar" className="hidden rounded-full bg-[#14120f] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(20,18,15,0.22)] sm:inline-flex">Agendar agora</a>
      </header>

      <section id="topo" className="mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-[var(--clinic-primary)]">{site.eyebrow || "Estetica premium e atendimento personalizado"}</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            {site.titulo_hero || `Realce sua beleza com ${brandName}`}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-neutral-700">
            {site.subtitulo_hero || "Conheca a clinica, escolha seu procedimento e reserve seu horario online com praticidade, seguranca e acompanhamento profissional."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#agendar" className="rounded-full bg-[var(--clinic-primary)] px-6 py-3 text-sm font-bold text-white shadow-[0_18px_44px_color-mix(in_srgb,var(--clinic-primary)_26%,transparent)]">Reservar atendimento</a>
            {whatsapp ? <a href={`https://wa.me/55${whatsapp}`} target="_blank" className="rounded-full border border-neutral-300 bg-white/70 px-6 py-3 text-sm font-bold text-neutral-900 backdrop-blur">Falar no WhatsApp</a> : null}
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              ["Atendimento", "Individualizado"],
              ["Agenda", "Online"],
              ["Pagamento", "Sinal seguro"],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-2xl border border-white/70 bg-white/62 p-4 shadow-[0_18px_44px_rgba(20,18,15,0.08)] backdrop-blur">
                <p className="text-xs uppercase tracking-[0.22em] text-neutral-500">{title}</p>
                <strong className="mt-2 block text-lg">{desc}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-8 rounded-[2rem] bg-[radial-gradient(circle,color-mix(in_srgb,var(--clinic-accent)_26%,transparent),transparent_68%)] blur-xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-[#15120f] p-6 text-white shadow-[0_32px_90px_rgba(20,18,15,0.26)]">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><Star size={22} /></span>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/55">Profissional</p>
                <h2 className="text-2xl font-semibold">{site.nome_profissional || profissionais[0]?.nome || brandName}</h2>
              </div>
            </div>
            <p className="mt-6 text-sm leading-7 text-white/72">
              {site.bio_profissional || profissionais[0]?.observacoes || "Atendimento cuidadoso, escuta ativa e plano de tratamento alinhado ao seu objetivo estetico."}
            </p>
            <div className="mt-8 grid gap-3">
              {[site.credencial_1 || "Protocolos personalizados", site.credencial_2 || "Ambiente reservado", site.credencial_3 || "Acompanhamento pos-procedimento"].map((item) => (
                <p key={item} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3 text-sm text-white/78"><CheckCircle2 size={17} className="text-[var(--clinic-accent)]" />{item}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="procedimentos" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--clinic-primary)]">Procedimentos</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight">Escolha o melhor protocolo para seu momento</h2>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {procedimentos.map((item) => (
            <article key={item.id} className="premium-animated-card rounded-3xl border border-white/70 bg-white/72 p-6 shadow-[0_20px_54px_rgba(20,18,15,0.09)] backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--clinic-primary)]">{item.categoria || "Procedimento"}</p>
                  <h3 className="mt-3 text-2xl font-semibold">{item.nome}</h3>
                </div>
                <span className="rounded-full bg-[color-mix(in_srgb,var(--clinic-accent)_18%,white)] px-3 py-1 text-xs font-bold text-[var(--clinic-primary)]">{item.duracao_minutos} min</span>
              </div>
              <p className="mt-4 min-h-16 text-sm leading-6 text-neutral-600">{item.descricao || "Procedimento com avaliacao profissional e orientacoes personalizadas."}</p>
              <div className="mt-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-neutral-500">Valor</p>
                  <strong className="text-2xl">{money(item.preco)}</strong>
                </div>
                <p className="max-w-36 text-right text-xs font-semibold text-neutral-500">{serviceLabel(item)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="agendar" className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-white/70 bg-white/72 p-6 shadow-[0_20px_54px_rgba(20,18,15,0.09)] backdrop-blur">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--clinic-primary)]">Agenda online</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight">Reserve seu horario</h2>
          <div className="mt-6 space-y-4 text-sm text-neutral-700">
            <p className="flex gap-3"><Clock size={18} className="text-[var(--clinic-primary)]" /> Atendimento de {schedule.inicio || "08:00"} as {schedule.fim || "18:00"}, conforme disponibilidade da equipe.</p>
            <p className="flex gap-3"><CreditCard size={18} className="text-[var(--clinic-primary)]" /> Quando houver sinal, voce sera direcionado para um checkout seguro.</p>
            <p className="flex gap-3"><ShieldCheck size={18} className="text-[var(--clinic-primary)]" /> Seus dados entram na agenda e no CRM da clinica automaticamente.</p>
            {clinic.endereco || clinic.cidade ? <p className="flex gap-3"><MapPin size={18} className="text-[var(--clinic-primary)]" /> {[clinic.endereco, clinic.cidade, clinic.estado].filter(Boolean).join(" - ")}</p> : null}
          </div>
        </div>

        <form action={createPublicBookingAction} className="rounded-3xl border border-white/70 bg-[#15120f] p-6 text-white shadow-[0_32px_90px_rgba(20,18,15,0.26)]">
          <input type="hidden" name="slug" value={clinic.slug} />
          {query?.erro ? <div className="mb-5 rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{query.mensagem || "Nao foi possivel concluir o agendamento."}</div> : null}
          {query?.ok ? <div className="mb-5 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{query.mensagem || "Agendamento solicitado com sucesso."}</div> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-white/75">Procedimento</span>
              <select name="procedimento_id" defaultValue={defaultProcedure?.id || ""} required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none">
                {procedimentos.map((item) => <option key={item.id} value={item.id} className="text-neutral-950">{item.nome} - {money(item.preco)} - {serviceLabel(item)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-white/75">Profissional</span>
              <select name="profissional_id" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none">
                <option value="" className="text-neutral-950">Primeiro disponivel</option>
                {profissionais.map((item) => <option key={item.id} value={item.id} className="text-neutral-950">{item.nome}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-white/75">Data e horario</span>
              <input name="data_hora" type="datetime-local" min={nextSuggestedDate().slice(0, 10)} defaultValue={nextSuggestedDate()} required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-white/75">Nome</span>
              <input name="nome" required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-white/75">WhatsApp</span>
              <input name="telefone" required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-white/75">E-mail</span>
              <input name="email" type="email" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-white/75">CPF</span>
              <input name="cpf" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none" />
            </label>
          </div>
          <label className="mt-5 flex items-start gap-3 text-sm text-white/70">
            <input type="checkbox" name="consentimento_lgpd" required className="mt-1" />
            Aceito que meus dados sejam usados para contato, agendamento e atendimento, conforme politica de privacidade da clinica.
          </label>
          <button type="submit" className="mt-6 w-full rounded-full bg-[var(--clinic-accent)] px-6 py-4 text-sm font-bold text-[#15120f] shadow-[0_18px_44px_color-mix(in_srgb,var(--clinic-accent)_26%,transparent)]">
            Confirmar agendamento
          </button>
        </form>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-neutral-200 px-5 py-8 text-sm text-neutral-500 sm:px-8 md:flex-row md:items-center md:justify-between">
        <p>{brandName} - {clinic.email || "Atendimento online"}</p>
        <p>Site e agenda integrados ao SaaS da clinica.</p>
      </footer>
    </main>
  );
}
