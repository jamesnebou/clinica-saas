import { Fragment } from "react";
import { CheckCircle2, Clock, CreditCard, MapPin, Menu, MessageCircle, Quote, ShieldCheck, Sparkles, Star } from "lucide-react";
import { notFound } from "next/navigation";
import { getGooglePlaceReviews } from "@/lib/google/places";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PublicBookingForm } from "./booking-form";
import { PublicLeadForm } from "./lead-form";
import { PublicScrollEffects } from "./scroll-effects";
import { PublicServicesSection } from "./services-section";

export const dynamic = "force-dynamic";

function safeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function googleEmbedUrl(clinic, site) {
  const mapsUrl = String(site.google_maps_url || "").trim();
  if (/^https:\/\/www\.google\.com\/maps\/embed/i.test(mapsUrl)) return mapsUrl;
  if (/^https:\/\/www\.google\.com\/maps/i.test(mapsUrl) && mapsUrl.includes("output=embed")) return mapsUrl;
  const address = [clinic.endereco, clinic.cidade, clinic.estado].filter(Boolean).join(", ");
  return `https://www.google.com/maps?q=${encodeURIComponent(address || clinic.nome)}&output=embed`;
}

function publicMedia(url) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return { type: "empty" };

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoId = parsed.searchParams.get("v") || parsed.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1];
      if (videoId) return { type: "iframe", url: `https://www.youtube.com/embed/${videoId}`, label: "YouTube" };
    }

    if (host === "youtu.be") {
      const videoId = parsed.pathname.split("/").filter(Boolean)[0];
      if (videoId) return { type: "iframe", url: `https://www.youtube.com/embed/${videoId}`, label: "YouTube" };
    }

    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const videoId = parsed.pathname.match(/\/(?:video\/)?(\d+)/)?.[1];
      if (videoId) return { type: "iframe", url: `https://player.vimeo.com/video/${videoId}`, label: "Vimeo" };
    }

    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(parsed.pathname)) {
      return { type: "video", url: rawUrl, label: "Vídeo" };
    }

    if (/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(parsed.pathname)) {
      return { type: "image", url: rawUrl, label: "Imagem" };
    }

    return { type: "external", url: rawUrl, label: host.includes("instagram") ? "Instagram" : parsed.hostname };
  } catch {
    return { type: "external", url: rawUrl, label: "Mídia externa" };
  }
}

function PublicMediaFrame({ url, title, fallbackImageUrl }) {
  const media = publicMedia(url);

  if (media.type === "iframe") {
    return (
      <iframe
        src={media.url}
        title={title}
        className="h-full min-h-[320px] w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  }

  if (media.type === "video") {
    return <video src={media.url} title={title} className="h-full min-h-[320px] w-full object-cover" controls playsInline />;
  }

  if (media.type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={media.url} alt={title} className="h-[420px] w-full object-cover" />
    );
  }

  if (media.type === "external") {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center bg-white/[0.06] px-8 text-center">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-[var(--clinic-accent)]">Mídia externa</p>
        <p className="mt-4 max-w-sm text-sm leading-6 text-white/66">
          {media.label} não permite abrir esse conteúdo dentro da página. Acesse pelo botão abaixo.
        </p>
        <a
          href={media.url}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex rounded-full bg-[var(--clinic-accent)] px-5 py-3 text-sm font-black text-[#17130f]"
        >
          Abrir mídia
        </a>
      </div>
    );
  }

  if (fallbackImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={fallbackImageUrl} alt={title} className="h-[420px] w-full object-cover" />
    );
  }

  return <div className="flex min-h-[320px] items-center justify-center px-6 text-center text-sm text-white/56">Adicione a URL da mídia nas configurações.</div>;
}

function fallbackImage(label, dark = false) {
  const bg = dark ? "15120f" : "f5eee8";
  const fg = dark ? "ffffff" : "7a6258";
  return `https://placehold.co/1200x1500/${bg}/${fg}?text=${encodeURIComponent(label)}`;
}

function InstagramMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

function renderFormattedText(line) {
  return String(line || "").split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-black">{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }

    return <Fragment key={index}>{part}</Fragment>;
  });
}

function RichText({ text, className = "" }) {
  const blocks = String(text || "").split(/\n{2,}/);

  return (
    <div className={className}>
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").filter(Boolean);
        const isList = lines.length > 0 && lines.every((line) => line.trim().startsWith("- "));

        if (isList) {
          return (
            <ul key={blockIndex} className={`${blockIndex ? "mt-5" : ""} list-disc space-y-2 pl-5`}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderFormattedText(line.trim().replace(/^- /, ""))}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIndex} className={blockIndex ? "mt-5" : ""}>
            {lines.map((line, lineIndex) => (
              <Fragment key={`${blockIndex}-${lineIndex}`}>
                {lineIndex ? <br /> : null}
                {renderFormattedText(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function isLeadPopupLink(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["popup", "form", "formulario", "formulário", "lead", "modal", "contato", "#popup", "#form", "#formulario", "#formulário", "#lead", "#modal", "#contato"].includes(normalized);
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
    title: `${site.titulo_hero || data?.metadata?.brand_name || data?.nome || "Clí­nica"} | Agendamento`,
    description: site.subtitulo_hero || "ConheÃ§a os procedimentos e agende seu atendimento.",
    icons: site.favicon_url ? { icon: [{ url: site.favicon_url }], shortcut: [{ url: site.favicon_url }], apple: [{ url: site.favicon_url }] } : undefined,
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
      .select("id, nome, categoria, descricao, duracao_minutos, preco, cuidados_antes, cuidados_depois, sinal_percentual, sinal_valor, destaque_site, ordem_site, imagem_url")
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
  const professionalBio = site.bio_profissional || profissionais[0]?.observacoes || "Atendimento cuidadoso, escuta ativa e plano de tratamento alinhado ao seu objetivo estético.";
  const heroImage = site.hero_image_url || site.profissional_image_url || fallbackImage(brandName, true);
  const professionalImage = site.profissional_image_url || site.hero_image_url || fallbackImage(professionalName);
  const clinicPhotos = [site.clinica_foto_1, site.clinica_foto_2, site.clinica_foto_3].filter(Boolean);
  const gallery = clinicPhotos.length ? clinicPhotos : [heroImage, professionalImage, fallbackImage("Clínica")];
  const address = [clinic.endereco, clinic.cidade, clinic.estado].filter(Boolean).join(" - ");
  const year = new Date().getFullYear();

  const fallbackTestimonials = [
    { nome: "Mariana S.", procedimento: "Tratamento facial", texto: "Atendimento impecável, ambiente acolhedor e resultado muito natural. Me senti segura desde a primeira avaliação." },
    { nome: "Fernanda L.", procedimento: "Harmonização", texto: "A equipe explicou tudo com clareza e respeitou meu objetivo. O resultado ficou exatamente como eu queria." },
    { nome: "Juliana M.", procedimento: "Protocolo estético", texto: "A clínica passa muita confiança. Gostei da organização, do cuidado e do acompanhamento depois do procedimento." },
    { nome: "Ana P.", procedimento: "Skincare", texto: "Experiência excelente, pontualidade e orientações precisas. Recomendo para quem busca cuidado sério e sofisticado." },
  ];
  const manualTestimonials = Array.isArray(site.depoimentos) && site.depoimentos.length
    ? site.depoimentos.filter((item) => item?.nome || item?.procedimento || item?.texto)
    : fallbackTestimonials;
  const googleReviews = site.google_reviews_ativo
    ? await getGooglePlaceReviews({ placeId: site.google_place_id, limit: 4 })
    : { reviews: [], rating: null, userRatingCount: null, googleMapsUri: null };
  const testimonials = googleReviews.reviews.length ? googleReviews.reviews : manualTestimonials;
  const googleReviewsUrl = site.google_reviews_url || googleReviews.googleMapsUri;
  const videoCtaUrl = String(site.video_cta_url || "").trim();
  const campaignCtaUrl = String(site.campanha_cta_url || "").trim();
  const campaignCtaHref = campaignCtaUrl || "popup";
  const videoCtaOpensLead = isLeadPopupLink(videoCtaUrl);
  const campaignCtaOpensLead = isLeadPopupLink(campaignCtaHref);

  return (
    <main
      className="public-site-shell min-h-screen overflow-hidden text-[#17130f]"
      style={{
        "--clinic-primary": primaryColor,
        "--clinic-accent": accentColor,
        background: "fixed radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--clinic-accent) 20%, transparent), transparent 34rem), fixed radial-gradient(circle at 96% 12%, color-mix(in srgb, var(--clinic-primary) 16%, transparent), transparent 30rem), linear-gradient(145deg, #fffaf5 0%, #f3eee7 45%, #ebe5dc 100%)",
      }}
    >
      <PublicScrollEffects />
      <header className="public-site-header relative z-[80] border-b border-white/20 bg-[#17130f]/70 px-5 py-4 text-white sm:px-8">
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
            <a href="#servicos">Serviços</a>
            <a href="#depoimentos">Depoimentos</a>
            <a href="#localizacao">Localização</a>
            <a href="popup">Quero saber mais</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href="/login-cliente" className="hidden rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white/60 transition hover:bg-white/10 hover:text-white sm:inline-flex">Área da clínica</a>
            <details className="public-mobile-menu group lg:hidden">
              <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-white/16 bg-white/8 text-white transition hover:bg-white/12 [&::-webkit-details-marker]:hidden">
                <Menu size={19} />
                <span className="sr-only">Abrir menu</span>
              </summary>
              <div className="public-mobile-menu-panel overflow-hidden rounded-2xl border border-white/12 bg-[#17130f]/98 p-2 text-sm font-bold text-white shadow-[0_24px_70px_rgba(0,0,0,0.44)]">
                <a href="#sobre" className="block rounded-xl px-4 py-3 hover:bg-white/8">Sobre</a>
                <a href="#servicos" className="block rounded-xl px-4 py-3 hover:bg-white/8">Serviços</a>
                <a href="#depoimentos" className="block rounded-xl px-4 py-3 hover:bg-white/8">Depoimentos</a>
                <a href="#localizacao" className="block rounded-xl px-4 py-3 hover:bg-white/8">Localização</a>
                <a href="popup" className="block rounded-xl px-4 py-3 hover:bg-white/8">Quero saber mais</a>
                <a href="/login-cliente" className="mt-1 block rounded-xl border border-white/12 bg-white/8 px-4 py-3 text-white/85">Área da clínica</a>
              </div>
            </details>
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
          <p className="text-xs font-bold uppercase tracking-[0.34em] text-white/70">{site.eyebrow || "Estética premium e atendimento personalizado"}</p>
          <h1 className="mx-auto mt-5 max-w-5xl text-5xl font-semibold leading-[1.03] tracking-tight sm:text-7xl">
            {site.titulo_hero || `Beleza, cuidado e tecnologia em ${brandName}`}
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/82">
            {site.subtitulo_hero || "Conheça a clínica, veja os procedimentos e reserve seu horário online com segurança."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#agendar" className="rounded-full bg-[var(--clinic-accent)] px-7 py-4 text-sm font-bold text-[#17130f] shadow-[0_20px_48px_rgba(0,0,0,0.24)]">Agendar consulta</a>
            <a href="#servicos" className="rounded-full border border-white/40 bg-white/10 px-7 py-4 text-sm font-bold text-white backdrop-blur">Conheça os serviços</a>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 h-10 w-6 -translate-x-1/2 rounded-full border border-white/55">
          <span className="mx-auto mt-2 block h-2 w-1 rounded-full bg-white/75" />
        </div>
      </section>

      <section id="sobre" className="public-section-soft mx-auto grid max-w-7xl gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={professionalImage} alt={professionalName} className="public-card-reveal public-reveal-left aspect-[4/5] w-full rounded-[2rem] object-cover shadow-[0_30px_86px_rgba(23,19,15,0.18)]" />
        </div>
        <div className="public-card-reveal public-reveal-right">
          <SectionHeading eyebrow="Sobre" title={professionalName} />
          <RichText text={professionalBio} className="mt-6 text-base leading-8 text-neutral-700" />
          <div className="mt-8 flex flex-wrap gap-3">
            {[site.credencial_1 || "Protocolos personalizados", site.credencial_2 || "Ambiente reservado", site.credencial_3 || "Acompanhamento pós-procedimento"].map((item) => (
              <span key={item} className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/60 px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm backdrop-blur">
                <CheckCircle2 size={16} className="text-[var(--clinic-primary)]" /> {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {site.campanha_ativa ? (
        <section className="site-campaign-section px-5 py-24 sm:px-8">
          <div className="public-card-reveal public-reveal-up site-dark-glass-card mx-auto grid max-w-7xl gap-8 p-6 text-white lg:grid-cols-[1.05fr_0.95fr] lg:p-10 lg:items-center">
            <div>
              <SectionHeading eyebrow="Campanha" title={site.campanha_titulo || "Protocolo em campanha"} description={site.campanha_subtitulo || "Uma condição especial para iniciar seu cuidado com orientação profissional."} tone="dark" />
              <RichText text={site.campanha_texto || "Destaque aqui o produto, serviço ou protocolo que a clínica deseja vender mais neste momento."} className="mt-6 text-base leading-8 text-white/70" />
              <a href={campaignCtaHref} data-lead-popup={campaignCtaOpensLead ? "true" : undefined} className="mt-8 inline-flex rounded-full bg-[var(--clinic-accent)] px-6 py-3 text-sm font-black text-[#17130f]">{site.campanha_cta_label || "Quero saber mais"}</a>
            </div>
            <div className="site-video-frame overflow-hidden rounded-[1.75rem]">
              <PublicMediaFrame url={site.campanha_media_url} title={site.campanha_titulo || "Campanha"} fallbackImageUrl={site.campanha_image_url || heroImage} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="public-section-warm mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <SectionHeading eyebrow="A clínica" title="Ambiente pensado para acolher, cuidar e transformar" description="O nosso espaço foi feito para o seu conforto e aconchego, com ambientes pensados para bem-estar, privacidade e segurança." center />
        <div className="mt-10 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gallery[0]} alt="clínica" className="public-card-reveal public-reveal-left h-[460px] w-full rounded-[2rem] object-cover shadow-[0_24px_70px_rgba(23,19,15,0.16)]" />
          <div className="grid gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gallery[1]} alt="Espaço da clínica" className="public-card-reveal public-reveal-right h-[222px] w-full rounded-[2rem] object-cover shadow-[0_20px_54px_rgba(23,19,15,0.12)]" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gallery[2]} alt="Atendimento" className="public-card-reveal public-reveal-up h-[222px] w-full rounded-[2rem] object-cover shadow-[0_20px_54px_rgba(23,19,15,0.12)]" />
          </div>
        </div>
      </section>

      <PublicServicesSection procedimentos={procedimentos} />

      <section id="depoimentos" className="public-section-soft mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <SectionHeading eyebrow="Depoimentos" title="O que pacientes dizem:" description="A satisfação dos pacientes são o maior reconhecimento." center />
        {googleReviewsUrl || googleReviews.rating ? (
          <div className="mt-6 flex flex-wrap justify-center gap-3 text-center">
            {googleReviews.rating ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/70 px-5 py-3 text-sm font-bold text-neutral-800 shadow-sm backdrop-blur">
                <Star size={17} className="fill-amber-400 text-amber-400" /> {Number(googleReviews.rating).toFixed(1)} no Google
                {googleReviews.userRatingCount ? <span className="font-semibold text-neutral-500">({googleReviews.userRatingCount} avaliações)</span> : null}
              </span>
            ) : null}
            {googleReviewsUrl ? (
              <a href={googleReviewsUrl} target="_blank" className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/70 px-5 py-3 text-sm font-bold text-neutral-800 shadow-sm backdrop-blur">
                <Star size={17} className="fill-amber-400 text-amber-400" /> Ver avaliações no Google
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {testimonials.map((item, index) => (
            <article key={`${item.nome || "depoimento"}-${index}`} className={`public-card-reveal ${index % 2 === 0 ? "public-reveal-left" : "public-reveal-right"} public-hover-card rounded-[1.75rem] border border-neutral-200 bg-white/70 p-7 shadow-[0_18px_44px_rgba(23,19,15,0.07)] backdrop-blur`}>
              <Quote size={34} className="text-[var(--clinic-primary)] opacity-35" />
              <p className="mt-5 text-sm leading-7 text-neutral-700">{item.texto || "Experiência excelente, atendimento cuidadoso e resultado alinhado ao que eu buscava."}</p>
              <div className="mt-7 flex items-end justify-between gap-4">
                <div>
                  <strong>{item.nome || "Paciente"}</strong>
                  <p className="mt-1 text-xs text-neutral-500">{item.procedimento || "Atendimento estético"}</p>
                </div>
                <span className="text-amber-400">{"★".repeat(Math.max(1, Math.min(5, Number(item.rating || 5))))}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {site.video_ativo ? (
        <section className="site-video-section px-5 py-24 sm:px-8">
          <div className="public-card-reveal public-reveal-up site-dark-glass-card mx-auto max-w-7xl p-6 text-white lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
              <div>
                <SectionHeading eyebrow="Vídeo" title={site.video_titulo || "Conheça a clínica"} description={site.video_subtitulo || "Veja de perto a estrutura, a abordagem e os cuidados que tornam a experiência mais segura e personalizada."} tone="dark" />
                <a href={videoCtaUrl || "#agendar"} data-lead-popup={videoCtaOpensLead ? "true" : undefined} className="mt-8 inline-flex rounded-full bg-[var(--clinic-accent)] px-6 py-3 text-sm font-black text-[#17130f]">{site.video_cta_label || "Agendar avaliação"}</a>
              </div>
              <div className="site-video-frame aspect-video overflow-hidden rounded-[1.5rem]">
                <PublicMediaFrame url={site.video_url} title={site.video_titulo || brandName} />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section id="agendar" className="public-booking-section mx-auto grid max-w-7xl gap-8 px-5 py-24 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="public-card-reveal public-reveal-left public-hover-card rounded-[1.75rem] border border-white/70 bg-white/72 p-7 shadow-[0_20px_54px_rgba(20,18,15,0.09)] backdrop-blur">
          <SectionHeading eyebrow="Agendamento" title="Reserve seu horário" description="Escolha procedimento, profissional e horário. A disponibilidade é validada com a agenda real da clínica." />
          <div className="mt-8 space-y-4 text-sm text-neutral-700">
            <p className="flex gap-3"><Clock size={18} className="text-[var(--clinic-primary)]" /> Atendimento de {schedule.inicio || "08:00"} às {schedule.fim || "18:00"}, conforme disponibilidade.</p>
            <p className="flex gap-3"><CreditCard size={18} className="text-[var(--clinic-primary)]" /> Quando houver sinal, você será direcionado para um checkout seguro.</p>
            <p className="flex gap-3"><ShieldCheck size={18} className="text-[var(--clinic-primary)]" /> Seus dados entram na agenda e no CRM da clínica automaticamente.</p>
            {address ? <p className="flex gap-3"><MapPin size={18} className="text-[var(--clinic-primary)]" /> {address}</p> : null}
          </div>
        </div>

        <div className="public-card-reveal public-reveal-right">
          <PublicBookingForm slug={clinic.slug} procedimentos={procedimentos} profissionais={profissionais} query={query} />
        </div>
      </section>

      <section id="localizacao" className="public-section-soft mx-auto grid max-w-7xl gap-8 px-5 py-24 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div className="public-card-reveal public-reveal-left public-hover-card rounded-[2rem] border border-white/70 bg-white/72 p-7 shadow-[0_20px_54px_rgba(20,18,15,0.08)] backdrop-blur">
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
        <div className="public-card-reveal public-reveal-right overflow-hidden rounded-[2rem] border border-white/70 bg-white/70 shadow-[0_24px_70px_rgba(23,19,15,0.12)] backdrop-blur">
          <iframe src={googleEmbedUrl(clinic, site)} title={`Mapa ${brandName}`} loading="lazy" className="h-[460px] w-full border-0" referrerPolicy="no-referrer-when-downgrade" />
        </div>
      </section>

      <footer className="bg-[#151515] px-5 py-16 text-white sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.2fr_0.8fr_1fr]">
          <div>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`Logo ${brandName}`} className="h-28 w-28 rounded-2xl object-contain bg-white/8 p-2" />
            ) : null}
            <h3 className="mt-5 text-xl font-semibold">{brandName}</h3>
            <p className="mt-3 max-w-sm text-sm leading-7 text-white/65">{professionalName}</p>
            <p className="mt-1 text-sm text-white/55">{site.eyebrow || "Estética premium e atendimento personalizado"}</p>
          </div>
          <div>
            <h4 className="font-semibold">Links rápidos</h4>
            <div className="mt-5 grid gap-3 text-sm text-white/68">
              <a href="#topo">Início</a>
              <a href="#sobre">Sobre</a>
              <a href="#servicos">Serviços</a>
              <a href="#depoimentos">Depoimentos</a>
              <a href="#agendar">Agendamento</a>
              <a href="#localizacao">Localização</a>
              <a href="/termos">Termos de uso</a>
              <a href="/privacidade">Privacidade</a>
              <a href="/login-cliente">Área da clínica</a>
            </div>
          </div>
          <div>
            <h4 className="font-semibold">Contato</h4>
            <div className="mt-5 space-y-4 text-sm leading-6 text-white/68">
              {address ? <p className="flex gap-3"><MapPin size={18} className="mt-0.5 shrink-0" /> {address}</p> : null}
              {clinic.telefone ? <p className="flex gap-3"><MessageCircle size={18} className="mt-0.5 shrink-0" /> {clinic.telefone}</p> : null}
              <div className="flex gap-3 pt-2">
                {site.instagram_url ? <a href={site.instagram_url} target="_blank" aria-label="Instagram" title="Instagram" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/16"><InstagramMark size={18} /></a> : null}
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

      <PublicLeadForm slug={clinic.slug} query={query} />
    </main>
  );
}


