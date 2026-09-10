import { ArrowLeft, CalendarDays, Clock, MapPin, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { PublicAnalyticsTracker } from "@/components/public-site/attribution-fields";
import { clinicTimeZone } from "@/lib/clinic/schedule";
import { publicImageSrcSet, publicImageUrl } from "@/lib/public-image";
import { getPrimaryClinicSegment } from "@/lib/segments/service";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PublicBookingForm } from "../booking-form";

export const dynamic = "force-dynamic";

function safeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

async function loadBookingPage(slug) {
  const { data: clinic, error } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, telefone, email, endereco, cidade, estado, status, metadata")
    .eq("slug", slug)
    .in("status", ["trial", "ativa"])
    .maybeSingle();

  if (error) throw error;
  if (!clinic || clinic.metadata?.site_publico?.publicado === false) notFound();

  const [proceduresResult, professionalsResult, segment] = await Promise.all([
    supabaseAdmin
      .from("procedimentos")
      .select("id, nome, categoria, descricao, duracao_minutos, intervalo_minutos, preco, preco_promocional, sinal_percentual, sinal_valor, destaque_site, ordem_site")
      .eq("clinica_id", clinic.id)
      .eq("ativo", true)
      .eq("publicado_site", true)
      .order("destaque_site", { ascending: false })
      .order("ordem_site", { ascending: true })
      .order("preco", { ascending: true }),
    supabaseAdmin
      .from("profissionais")
      .select("id, nome, especialidade")
      .eq("clinica_id", clinic.id)
      .eq("ativo", true)
      .order("nome", { ascending: true }),
    getPrimaryClinicSegment(clinic.id, supabaseAdmin),
  ]);

  if (proceduresResult.error) throw proceduresResult.error;
  if (professionalsResult.error) throw professionalsResult.error;

  return { clinic, procedimentos: proceduresResult.data || [], profissionais: professionalsResult.data || [], segment };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { data: clinic } = await supabaseAdmin.from("clinicas").select("nome, metadata").eq("slug", slug).maybeSingle();
  const brandName = clinic?.metadata?.brand_name || clinic?.nome || "Clínica";
  return {
    title: `Agendamento | ${brandName}`,
    description: `Escolha o atendimento, a profissional, a data e o horário na ${brandName}.`,
  };
}

export default async function DirectBookingPage({ params, searchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const { clinic, procedimentos, profissionais, segment } = await loadBookingPage(slug);
  const metadata = clinic.metadata || {};
  const site = metadata.site_publico || {};
  const brandName = metadata.brand_name || clinic.nome;
  const logoUrl = metadata.logo_url || "";
  const primaryColor = safeColor(metadata.primary_color, "#2e3a2d");
  const accentColor = safeColor(metadata.accent_color, "#d99bae");
  const heroImage = site.hero_image_url || site.profissional_image_url || "/marketing/multisegment-hero.jpg";
  const address = [clinic.endereco, clinic.cidade, clinic.estado].filter(Boolean).join(" - ");
  const procedureLabel = segment.labels.procedimento.toLocaleLowerCase("pt-BR");

  return (
    <main id="agendar" className="min-h-screen overflow-x-hidden bg-[#f4f0ea] text-[#17130f]" style={{ "--clinic-primary": primaryColor, "--clinic-accent": accentColor }}>
      <PublicAnalyticsTracker slug={slug} />
      <header className="border-b border-black/10 bg-white/92 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <a href={`/c/${slug}`} className="inline-flex min-w-0 items-center gap-3" aria-label={`Voltar ao site de ${brandName}`}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={publicImageUrl(logoUrl, { width: 96, height: 96, quality: 76, resize: "contain" })} alt="" width="44" height="44" className="h-11 w-11 rounded-lg object-contain" />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--clinic-primary)] text-white"><CalendarDays size={20} /></span>
            )}
            <span className="truncate text-sm font-black uppercase text-[var(--clinic-primary)]">{brandName}</span>
          </a>
          <a href={`/c/${slug}`} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-sm font-bold text-neutral-700">
            <ArrowLeft size={17} /> <span className="hidden sm:inline">Voltar ao site</span>
          </a>
        </div>
      </header>

      <section className="relative isolate overflow-hidden px-5 py-12 text-white sm:px-8 sm:py-16">
        <picture className="absolute inset-0 -z-20">
          <img src={publicImageUrl(heroImage, { width: 1600, quality: 72 })} srcSet={publicImageSrcSet(heroImage, [640, 960, 1280, 1600], { quality: 72 })} sizes="100vw" alt="" className="h-full w-full object-cover" />
        </picture>
        <div className="absolute inset-0 -z-10 bg-[#17130f]/72" />
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-black uppercase text-white/75">Agendamento online</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">Seu próximo horário começa aqui.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/82 sm:text-lg">Escolha o {procedureLabel}, a profissional e o melhor horário. A confirmação entra diretamente na agenda da clínica.</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <div className="py-2 lg:sticky lg:top-6">
          <p className="text-xs font-black uppercase text-[var(--clinic-primary)]">Reserva rápida e segura</p>
          <h2 className="mt-3 text-3xl font-black">Preencha seus dados para reservar.</h2>
          <p className="mt-4 text-base leading-7 text-neutral-600">A disponibilidade exibida é atualizada com a agenda real da equipe.</p>
          <div className="mt-7 space-y-4 text-sm leading-6 text-neutral-700">
            <p className="flex gap-3"><Clock className="mt-0.5 shrink-0 text-[var(--clinic-primary)]" size={19} /> Datas sem horários aparecem indisponíveis no calendário.</p>
            <p className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[var(--clinic-primary)]" size={19} /> Seus dados são usados somente para atendimento e confirmação da reserva.</p>
            {address ? <p className="flex gap-3"><MapPin className="mt-0.5 shrink-0 text-[var(--clinic-primary)]" size={19} /> {address}</p> : null}
          </div>
        </div>

        <PublicBookingForm
          slug={slug}
          procedimentos={procedimentos}
          profissionais={profissionais}
          query={query}
          timeZone={clinicTimeZone(clinic)}
          terminology={segment.labels}
          primaryColor={primaryColor}
          accentColor={accentColor}
          returnTo="agendamento"
        />
      </section>
    </main>
  );
}
