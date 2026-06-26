import { Camera, CheckCircle2, Clock, CreditCard, MapPin, MessageCircle, Quote, ShieldCheck, Sparkles, Star } from "lucide-react";
import { notFound } from "next/navigation";
import { getGooglePlaceReviews } from "@/lib/google/places";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PublicBookingForm } from "./booking-form";

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

function googleEmbedUrl(clinic, site) {
  const mapsUrl = String(site.google_maps_url || "").trim();
  if (/^https:\/\/www\.google\.com\/maps\/embed/i.test(mapsUrl)) return mapsUrl;
  if (/^https:\/\/www\.google\.com\/maps/i.test(mapsUrl) && mapsUrl.includes("output=embed")) return mapsUrl;
  const address = [clinic.endereco, clinic.cidade, clinic.estado].filter(Boolean).join(", ");
  return `https://www.google.com/maps?q=${encodeURIComponent(address || clinic.nome)}&output=embed`;
}

function fallbackImage(label, dark = false) {
  const bg = dark ? "15120f" : "f5eee8";
  const fg = dark ? "ffffff" : "7a6258";
  return `https://placehold.co/1200x1500/${bg}/${fg}?text=${encodeURIComponent(label)}`;
}

function SectionHeading({ eyebrow, title, description, center = false, tone = "light" }) {
  const dark = tone === "dark";

  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className={`text-xs font-bold uppercase tracking-[0.32em] ${dark ? "text-[var(--clinic-accent)]" : "text-[var(--clinic-primary)]"}`}>{eyebrow}</p>
      <h2 className={`mt-3 text-4xl font-semibold tracking-tight sm:text-5xl ${dark ? "text-white" : "text-[#181510]"}`}>{title}</h2>
      {description ? <p className={`mt-4 text-base leading-8 ${dark ? "text-white/68" : "text-neutral-600"}`}>{description}</p> : null}
    </div>
  );
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

  const primaryColor = safeColor(meta.primary_color, "#2e3a2d");
  const accentColor = safeColor(meta.accent_color, "#d99bae");

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
  const professionalName = site.nome_profissional || profissionais[0]?.nome || brandName;
  const professionalBio = site.bio_profissional || profissionais[0]?.observacoes || "Atendimento cuidadoso, escuta ativa e plano de tratamento alinhado ao seu objetivo estetico.";
  const heroImage = site.hero_image_url || site.profissional_image_url || fallbackImage(brandName, true);
  const professionalImage = site.profissional_image_url || site.hero_image_url || fallbackImage(professionalName);
  const clinicPhotos = [site.clinica_foto_1, site.clinica_foto_2, site.clinica_foto_3].filter(Boolean);
  const gallery = clinicPhotos.length ? clinicPhotos : [heroImage, professionalImage, fallbackImage("Clinica")];
  const address = [clinic.endereco, clinic.cidade, clinic.estado].filter(Boolean).join(" - ");
  const servicesLoop = [...procedimentos, ...procedimentos];
  const year = new Date().getFullYear();

  const fallbackTestimonials = [
    { nome: "Mariana S.", procedimento: "Tratamento facial", texto: "Atendimento impecavel, ambiente acolhedor e resultado muito natural. Me senti segura desde a primeira avaliacao." },
    { nome: "Fernanda L.", procedimento: "Harmonizacao", texto: "A equipe explicou tudo com clareza e respeitou meu objetivo. O resultado ficou exatamente como eu queria." },
    { nome: "Juliana M.", procedimento: "Protocolo estetico", texto: "A clinica passa muita confianca. Gostei da organizacao, do cuidado e do acompanhamento depois do procedimento." },
    { nome: "Ana P.", procedimento: "Skincare", texto: "Experiencia excelente, pontualidade e orientacoes precisas. Recomendo para quem busca cuidado serio e sofisticado." },
  ];
  const manualTestimonials = Array.isArray(site.depoimentos) && site.depoimentos.length
    ? site.depoimentos.filter((item) => item?.nome || item?.procedimento || item?.texto)
    : fallbackTestimonials;
  const googleReviews = site.google_reviews_ativo
    ? await getGooglePlaceReviews({ placeId: site.google_place_id, limit: 4 })
    : { reviews: [], rating: null, userRatingCount: null, googleMapsUri: null };
  const testimonials = googleReviews.reviews.length ? googleReviews.reviews : manualTestimonials;
  const googleReviewsUrl = site.google_reviews_url || googleReviews.googleMapsUri;

  return (
    <main
      className="public-site-shell min-h-screen overflow-hidden text-[#17130f]"
      style={{
        "--clinic-primary": primaryColor,
        "--clinic-accent": accentColor,
        background: "fixed radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--clinic-accent) 20%, transparent), transparent 34rem), fixed radial-gradient(circle at 96% 12%, color-mix(in srgb, var(--clinic-primary) 16%, transparent), transparent 30rem), linear-gradient(145deg, #fffaf5 0%, #f3eee7 45%, #ebe5dc 100%)",
      }}
    >
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/20 bg-[#17130f]/45 px-5 py-4 text-white backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">
          <a href="#topo" className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`Logo ${brandName}`} className="h-10 w-10 rounded-full object-contain" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/12"><Sparkles size={19} /></span>
            )}
            <span className="truncate text-xs font-bold uppercase tracking-[0.28em]">{brandName}</span>
          </a>
          <nav className="hidden items-center gap-5 text-sm font-semibold text-white/78 lg:flex">
            <a href="#sobre">Sobre</a>
            <a href="#servicos">Servicos</a>
            <a href="#depoimentos">Depoimentos</a>
            <a href="#localizacao">Localizacao</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href="/login-cliente" className="hidden rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white/60 transition hover:bg-white/10 hover:text-white sm:inline-flex">Area da clinica</a>
            <a href="#agendar" className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#17130f]">Agendar</a>
          </div>
        </div>
      </header>

      <section id="topo" className="relative flex min-h-screen items-center justify-center px-5 py-28 text-center text-white sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={heroImage} alt={brandName} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[#17130f]/55" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_0%,rgba(0,0,0,0.48)_72%)]" />
        <div className="relative z-10 mx-auto max-w-5xl">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`Logo ${brandName}`} className="mx-auto mb-8 h-28 w-28 rounded-full object-contain shadow-[0_24px_60px_rgba(0,0,0,0.24)]" />
          ) : null}
          <p className="text-xs font-bold uppercase tracking-[0.34em] text-white/70">{site.eyebrow || "Estetica premium e atendimento personalizado"}</p>
          <h1 className="mx-auto mt-5 max-w-5xl text-5xl font-semibold leading-[1.03] tracking-tight sm:text-7xl">
            {site.titulo_hero || `Beleza, cuidado e tecnologia em ${brandName}`}
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/82">
            {site.subtitulo_hero || "Conheca a clinica, veja os procedimentos e reserve seu horario online com seguranca."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#agendar" className="rounded-full bg-[var(--clinic-accent)] px-7 py-4 text-sm font-bold text-[#17130f] shadow-[0_20px_48px_rgba(0,0,0,0.24)]">Agendar consulta</a>
            <a href="#servicos" className="rounded-full border border-white/40 bg-white/10 px-7 py-4 text-sm font-bold text-white backdrop-blur">Conheca os servicos</a>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 h-10 w-6 -translate-x-1/2 rounded-full border border-white/55">
          <span className="mx-auto mt-2 block h-2 w-1 rounded-full bg-white/75" />
        </div>
      </section>

      <section id="sobre" className="public-section-soft mx-auto grid max-w-7xl gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={professionalImage} alt={professionalName} className="aspect-[4/5] w-full rounded-[2rem] object-cover shadow-[0_30px_86px_rgba(23,19,15,0.18)]" />
        </div>
        <div>
          <SectionHeading eyebrow="Sobre" title={professionalName} />
          <p className="mt-6 text-base leading-8 text-neutral-700">{professionalBio}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {[site.credencial_1 || "Protocolos personalizados", site.credencial_2 || "Ambiente reservado", site.credencial_3 || "Acompanhamento pos-procedimento"].map((item) => (
              <span key={item} className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/60 px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm backdrop-blur">
                <CheckCircle2 size={16} className="text-[var(--clinic-primary)]" /> {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section-warm mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <SectionHeading eyebrow="A clínica" title="Ambiente pensado para acolher, cuidar e transformar" description="O Nosso espaço foi feito para o seu conforto e aconchego. Com uma sala climatizada e pensada no seu bem estar." center />
        <div className="mt-10 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gallery[0]} alt="Clinica" className="h-[460px] w-full rounded-[2rem] object-cover shadow-[0_24px_70px_rgba(23,19,15,0.16)]" />
          <div className="grid gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gallery[1]} alt="Espaco da clinica" className="h-[222px] w-full rounded-[2rem] object-cover shadow-[0_20px_54px_rgba(23,19,15,0.12)]" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gallery[2]} alt="Atendimento" className="h-[222px] w-full rounded-[2rem] object-cover shadow-[0_20px_54px_rgba(23,19,15,0.12)]" />
          </div>
        </div>
      </section>

      <section id="servicos" className="public-services-section relative overflow-hidden py-24 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_0%,color-mix(in_srgb,var(--clinic-accent)_22%,transparent),transparent_32rem),radial-gradient(circle_at_85%_18%,color-mix(in_srgb,var(--clinic-primary)_24%,transparent),transparent_30rem)]" />
        <div className="relative z-10">
          <SectionHeading eyebrow="Nossos serviços" title="Protocólos em destaque" description="Passe pelos tratamentos e escolha o melhor ponto de partida para sua avaliação." center tone="dark" />
        </div>
        <div className="relative z-10 mt-12 overflow-hidden">
          <div className="public-services-track flex w-max gap-5 px-5 sm:px-8">
            {servicesLoop.map((item, index) => (
              <article key={`${item.id}-${index}`} className="public-service-card public-service-card-dark w-[330px] shrink-0 rounded-[1.75rem] border border-white/10 bg-white/[0.075] p-6 text-white backdrop-blur-2xl md:w-[390px]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--clinic-accent)]">{item.categoria || "Procedimento"}</p>
                    <h3 className="mt-3 text-2xl font-semibold text-white">{item.nome}</h3>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/78">{item.duracao_minutos} min</span>
                </div>
                <p className="mt-5 min-h-24 text-sm leading-7 text-white/62">{item.descricao || "Procedimento com avaliacao profissional e orientacoes personalizadas."}</p>
                <div className="mt-7 flex items-end justify-between gap-4 border-t border-white/10 pt-5">
                  <div>
                    <p className="text-xs text-white/42">Valor</p>
                    <strong className="text-2xl text-white">{money(item.preco)}</strong>
                  </div>
                  <p className="max-w-36 text-right text-xs font-semibold text-white/50">{serviceLabel(item)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="depoimentos" className="public-section-soft mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <SectionHeading eyebrow="Depoimentos" title="O que pacientes dizem:" description="A satisfação dos pacientes é o maior reconhecimento." center />
        {googleReviewsUrl || googleReviews.rating ? (
          <div className="mt-6 flex flex-wrap justify-center gap-3 text-center">
            {googleReviews.rating ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/70 px-5 py-3 text-sm font-bold text-neutral-800 shadow-sm backdrop-blur">
                <Star size={17} className="fill-amber-400 text-amber-400" /> {Number(googleReviews.rating).toFixed(1)} no Google
                {googleReviews.userRatingCount ? <span className="font-semibold text-neutral-500">({googleReviews.userRatingCount} avaliacoes)</span> : null}
              </span>
            ) : null}
            {googleReviewsUrl ? (
              <a href={googleReviewsUrl} target="_blank" className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/70 px-5 py-3 text-sm font-bold text-neutral-800 shadow-sm backdrop-blur">
                <Star size={17} className="fill-amber-400 text-amber-400" /> Ver avaliacoes no Google
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {testimonials.map((item, index) => (
            <article key={`${item.nome || "depoimento"}-${index}`} className="rounded-[1.75rem] border border-neutral-200 bg-white/70 p-7 shadow-[0_18px_44px_rgba(23,19,15,0.07)] backdrop-blur">
              <Quote size={34} className="text-[var(--clinic-primary)] opacity-35" />
              <p className="mt-5 text-sm leading-7 text-neutral-700">{item.texto || "Experiencia excelente, atendimento cuidadoso e resultado alinhado ao que eu buscava."}</p>
              <div className="mt-7 flex items-end justify-between gap-4">
                <div>
                  <strong>{item.nome || "Paciente"}</strong>
                  <p className="mt-1 text-xs text-neutral-500">{item.procedimento || "Atendimento estetico"}</p>
                </div>
                <span className="text-amber-400">{"★".repeat(Math.max(1, Math.min(5, Number(item.rating || 5))))}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="agendar" className="public-section-warm mx-auto grid max-w-7xl gap-8 px-5 py-24 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.75rem] border border-white/70 bg-white/72 p-7 shadow-[0_20px_54px_rgba(20,18,15,0.09)] backdrop-blur">
          <SectionHeading eyebrow="Agendamento" title="Reserve seu horário" description="Escolha procedimento, profissional e horário. A disponibilidade e validada com a agenda real da clínica." />
          <div className="mt-8 space-y-4 text-sm text-neutral-700">
            <p className="flex gap-3"><Clock size={18} className="text-[var(--clinic-primary)]" /> Atendimento de {schedule.inicio || "08:00"} as {schedule.fim || "18:00"}, conforme disponibilidade.</p>
            <p className="flex gap-3"><CreditCard size={18} className="text-[var(--clinic-primary)]" /> Quando houver sinal, voce sera direcionado para um checkout seguro.</p>
            <p className="flex gap-3"><ShieldCheck size={18} className="text-[var(--clinic-primary)]" /> Seus dados entram na agenda e no CRM da clinica automaticamente.</p>
            {address ? <p className="flex gap-3"><MapPin size={18} className="text-[var(--clinic-primary)]" /> {address}</p> : null}
          </div>
        </div>

        <PublicBookingForm slug={clinic.slug} procedimentos={procedimentos} profissionais={profissionais} query={query} />
      </section>

      <section id="localizacao" className="public-section-soft mx-auto grid max-w-7xl gap-8 px-5 py-24 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div className="rounded-[2rem] border border-white/70 bg-white/72 p-7 shadow-[0_20px_54px_rgba(20,18,15,0.08)] backdrop-blur">
          <SectionHeading eyebrow="Localização" title="Como chegar?" description="Use o mapa para chegar até a clínica ou fale com a equipe pelo WhatsApp antes do atendimento." />
          <div className="mt-8 space-y-4 text-sm leading-7 text-neutral-700">
            {address ? <p className="flex gap-3"><MapPin size={19} className="mt-1 shrink-0 text-[var(--clinic-primary)]" /> <span>{address}</span></p> : null}
            {clinic.telefone ? <p className="flex gap-3"><MessageCircle size={19} className="mt-1 shrink-0 text-[var(--clinic-primary)]" /> <span>{clinic.telefone}</span></p> : null}
            {clinic.email ? <p className="flex gap-3"><ShieldCheck size={19} className="mt-1 shrink-0 text-[var(--clinic-primary)]" /> <span>{clinic.email}</span></p> : null}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {site.google_maps_url ? <a href={site.google_maps_url} target="_blank" className="rounded-full bg-[var(--clinic-primary)] px-5 py-3 text-sm font-bold text-white">Abrir no Google Maps</a> : null}
            {whatsapp ? <a href={`https://wa.me/55${whatsapp}`} target="_blank" className="rounded-full border border-neutral-300 bg-white/70 px-5 py-3 text-sm font-bold text-neutral-900">Chamar no WhatsApp</a> : null}
          </div>
        </div>
        <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/70 shadow-[0_24px_70px_rgba(23,19,15,0.12)] backdrop-blur">
          <iframe src={googleEmbedUrl(clinic, site)} title={`Mapa ${brandName}`} loading="lazy" className="h-[460px] w-full border-0" referrerPolicy="no-referrer-when-downgrade" />
        </div>
      </section>

      <footer className="bg-[#263224] px-5 py-16 text-white sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.2fr_0.8fr_1fr]">
          <div>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`Logo ${brandName}`} className="h-28 w-28 rounded-2xl object-contain bg-white/8 p-2" />
            ) : null}
            <h3 className="mt-5 text-xl font-semibold">{brandName}</h3>
            <p className="mt-3 max-w-sm text-sm leading-7 text-white/65">{professionalName}</p>
            <p className="mt-1 text-sm text-white/55">{site.eyebrow || "Estetica premium e atendimento personalizado"}</p>
          </div>
          <div>
            <h4 className="font-semibold">Links rapidos</h4>
            <div className="mt-5 grid gap-3 text-sm text-white/68">
              <a href="#topo">Inicio</a>
              <a href="#sobre">Sobre</a>
              <a href="#serviços">Servicos</a>
              <a href="#depoimentos">Depoimentos</a>
              <a href="#agendar">Agendamento</a>
              <a href="#localização">Localizacao</a>
              <a href="/termos">Termos de uso</a>
              <a href="/privacidade">Privacidade</a>
              <a href="/login-cliente">Area da clinica</a>
            </div>
          </div>
          <div>
            <h4 className="font-semibold">Contato</h4>
            <div className="mt-5 space-y-4 text-sm leading-6 text-white/68">
              {address ? <p className="flex gap-3"><MapPin size={18} className="mt-0.5 shrink-0" /> {address}</p> : null}
              {clinic.telefone ? <p className="flex gap-3"><MessageCircle size={18} className="mt-0.5 shrink-0" /> {clinic.telefone}</p> : null}
              <div className="flex gap-3 pt-2">
                {site.instagram_url ? <a href={site.instagram_url} target="_blank" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"><Camera size={18} /></a> : null}
                {whatsapp ? <a href={`https://wa.me/55${whatsapp}`} target="_blank" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"><MessageCircle size={18} /></a> : null}
              </div>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-7xl border-t border-white/10 pt-8 text-center text-xs text-white/50">
          © {year} {brandName}. Todos os direitos reservados.
        </div>
      </footer>

      {whatsapp ? (
        <a href={`https://wa.me/55${whatsapp}`} target="_blank" className="public-whatsapp-float whatsapp-pulse flex h-14 w-14 items-center justify-center rounded-full bg-[#20c55e] text-white shadow-[0_18px_44px_rgba(32,197,94,0.34)]">
          <MessageCircle size={27} />
        </a>
      ) : null}
    </main>
  );
}
