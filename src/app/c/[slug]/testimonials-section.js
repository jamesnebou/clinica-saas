"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { testimonialRating } from "@/lib/public-testimonials.mjs";

export function TestimonialsSection({ slug, connected, manual, clientLabel }) {
  const sectionRef = useRef(null);
  const trackRef = useRef(null);
  const [reviews, setReviews] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!connected) return;
    const section = sectionRef.current;
    if (!section) return;
    const controller = new AbortController();
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      fetch(`/api/public/google-reviews?slug=${encodeURIComponent(slug)}`, { cache: "no-store", signal: controller.signal })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => { if (!controller.signal.aborted) setReviews(data); })
        .catch(() => {})
        .finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    }, { rootMargin: "300px" });
    observer.observe(section);
    return () => { observer.disconnect(); controller.abort(); };
  }, [connected, slug]);

  const googleItems = Array.isArray(reviews?.reviews)
    ? reviews.reviews.filter((item) => item.texto && item.googleMapsUri && (item.nome || item.authorPhotoUri))
    : [];
  const hasGoogle = googleItems.length > 0;
  const manualItems = Array.isArray(manual) ? manual.filter((item) => item?.texto?.trim()) : [];
  if (!connected && !manualItems.length) return null;
  if (connected && loaded && !hasGoogle && !manualItems.length) return null;

  function slide(direction) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector("article");
    if (card) track.scrollBy({ left: direction * (card.getBoundingClientRect().width + 20), behavior: "smooth" });
  }

  return (
    <section ref={sectionRef} id="depoimentos" className="public-section-soft mx-auto max-w-7xl px-5 py-20 sm:px-8">
      <div className="text-center">
        <p className="text-xs font-bold uppercase text-[var(--clinic-primary)]">Depoimentos</p>
        <h2 className="mt-3 text-3xl font-semibold text-neutral-950">Avaliações dos {clientLabel}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-600">A experiência de quem já esteve aqui.</p>
      </div>

      {hasGoogle ? (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-neutral-700">
            {reviews.rating !== null ? <span className="inline-flex items-center gap-1 font-semibold"><Star size={16} className="fill-amber-400 text-amber-400" /> {reviews.rating.toFixed(1)} no <span translate="no" className="font-normal text-[#5e5e5e]">Google Maps</span></span> : null}
            {reviews.userRatingCount !== null ? <span>{reviews.userRatingCount} avaliações</span> : null}
            {reviews.googleMapsUri ? <a href={reviews.googleMapsUri} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">Ver todas no Google</a> : null}
          </div>
          <div className="mt-8 flex justify-end gap-2">
            <button type="button" onClick={() => slide(-1)} aria-label="Avaliações anteriores" title="Avaliações anteriores" className="grid size-9 place-items-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-700"><ChevronLeft size={17} /></button>
            <button type="button" onClick={() => slide(1)} aria-label="Próximas avaliações" title="Próximas avaliações" className="grid size-9 place-items-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-700"><ChevronRight size={17} /></button>
          </div>
          <div ref={trackRef} className="mt-3 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-5 [scrollbar-width:thin]" aria-label="Avaliações do Google">
            {googleItems.map((item, index) => (
              <article key={`${item.googleMapsUri}-${index}`} className="flex min-w-0 flex-[0_0_87%] snap-start flex-col rounded-md border border-neutral-200 bg-white p-5 shadow-sm sm:flex-[0_0_calc(50%-10px)] lg:flex-[0_0_calc(33.333%-14px)]">
                {testimonialRating(item.rating) ? <span aria-label={`${item.rating} de 5 estrelas`} className="text-base text-amber-500">{"★".repeat(item.rating)}</span> : null}
                <p className="mt-4 line-clamp-6 flex-1 text-sm leading-7 text-neutral-700">{item.texto}</p>
                <div className="mt-5 flex items-center gap-3 border-t border-neutral-100 pt-4">
                  {item.authorPhotoUri ? <Image src={item.authorPhotoUri} alt="" width={36} height={36} unoptimized className="size-9 rounded-full object-cover" /> : null}
                  <div className="min-w-0 flex-1">
                    {item.nome ? item.authorUri ? <a href={item.authorUri} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-neutral-900 underline-offset-2 hover:underline">{item.nome}</a> : <strong className="block truncate text-sm text-neutral-900">{item.nome}</strong> : null}
                    {item.relativeTime ? <p className="text-xs text-neutral-500">{item.relativeTime}</p> : null}
                  </div>
                </div>
                {item.visitDate ? <p className="mt-2 text-xs text-neutral-500">Visita: {String(item.visitDate.month).padStart(2, "0")}/{item.visitDate.year}</p> : null}
                {item.translated ? <p className="mt-2 text-xs text-neutral-500">Texto traduzido pelo Google</p> : null}
                <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                  <span translate="no" className="whitespace-nowrap font-normal text-[#5e5e5e]">Google Maps</span>
                  <a href={item.googleMapsUri} target="_blank" rel="noopener noreferrer" className="font-semibold text-neutral-800 underline underline-offset-2">Ver no Google</a>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-neutral-500">Avaliações apresentadas pelo Google por relevância; exibimos somente as que contêm texto, autoria e link individual.</p>
          {reviews.attributions?.length ? <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-neutral-500">{reviews.attributions.map((item) => item.providerUri ? <a key={item.provider} href={item.providerUri} target="_blank" rel="noopener noreferrer" className="underline">{item.provider}</a> : <span key={item.provider}>{item.provider}</span>)}</div> : null}
        </>
      ) : connected && !loaded && !manualItems.length ? <p className="mt-10 text-center text-sm text-neutral-500" role="status">Carregando avaliações...</p> : null}

      {manualItems.length ? <div className={hasGoogle ? "mt-10 border-t border-neutral-200 pt-8" : "mt-10"}>
        {hasGoogle ? <h3 className="mb-5 text-lg font-semibold text-neutral-900">Depoimentos da clínica</h3> : null}
        <div className="grid gap-5 md:grid-cols-2">
          {manualItems.map((item, index) => <article key={`${item.nome || "depoimento"}-${index}`} className="rounded-md border border-neutral-200 bg-white/80 p-6 shadow-sm">
            <p className="text-sm leading-7 text-neutral-700">{item.texto}</p>
            <div className="mt-5">{item.nome ? <strong className="text-sm">{item.nome}</strong> : null}{item.procedimento ? <p className="mt-1 text-xs text-neutral-500">{item.procedimento}</p> : null}</div>
          </article>)}
        </div>
      </div> : null}
    </section>
  );
}
