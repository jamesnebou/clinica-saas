"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { publicImageSrcSet, publicImageUrl } from "@/lib/public-image";

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function displayPrice(procedimento) {
  return procedimento?.preco_promocional ?? procedimento?.preco ?? 0;
}

function depositValue(procedimento) {
  const price = Number(displayPrice(procedimento));
  const fixed = Number(procedimento?.sinal_valor || 0);
  const percent = Number(procedimento?.sinal_percentual || 0);
  const value = fixed > 0 ? fixed : percent > 0 ? price * (percent / 100) : 0;
  return Math.max(0, Math.min(price, Number(value.toFixed(2))));
}

function serviceLabel(procedimento) {
  const signal = depositValue(procedimento);
  if (signal <= 0) return "Agendamento sem sinal online";
  return `Sinal de ${money(signal)} no checkout`;
}

function fallbackImage(label, dark = false) {
  const bg = dark ? "15120f" : "f5eee8";
  const fg = dark ? "ffffff" : "7a6258";
  return `https://placehold.co/1200x900/${bg}/${fg}?text=${encodeURIComponent(label)}`;
}

export function PublicServicesSection({ procedimentos = [], terminology = {} }) {
  const serviceSingular = terminology.procedimento || "Procedimento";
  const servicePlural = terminology.procedimentos || "Procedimentos";
  const professionalLower = String(terminology.profissional || "Profissional").toLocaleLowerCase("pt-BR");
  const [selected, setSelected] = useState(null);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const pointerRef = useRef({ active: false, captured: false, pointerId: null, startX: 0, startScrollLeft: 0 });
  const draggedRef = useRef(false);
  const navigationTimerRef = useRef(null);
  const repeatCount = 2;
  const servicesLoop = useMemo(
    () => Array.from({ length: repeatCount }).flatMap(() => procedimentos),
    [procedimentos, repeatCount]
  );
  const canUsePortal = typeof document !== "undefined";

  useEffect(() => {
    if (!selected) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setSelected(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selected]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || procedimentos.length === 0) return;

    const segmentWidth = () => track.scrollWidth / repeatCount;
    const setInitialPosition = () => {
      viewport.scrollLeft = 0;
    };

    setInitialPosition();
    window.addEventListener("resize", setInitialPosition);

    return () => {
      window.removeEventListener("resize", setInitialPosition);
    };
  }, [procedimentos, repeatCount]);

  useEffect(() => () => {
    if (navigationTimerRef.current) window.clearTimeout(navigationTimerRef.current);
  }, []);

  function handlePointerDown(event) {
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.classList.add("is-dragging");

    pointerRef.current = {
      active: true,
      captured: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
    };
    draggedRef.current = false;
  }

  function handlePointerMove(event) {
    const viewport = viewportRef.current;
    const pointer = pointerRef.current;
    if (!viewport || !pointer.active) return;

    const distance = event.clientX - pointer.startX;
    if (Math.abs(distance) <= 6 && !draggedRef.current) return;

    draggedRef.current = true;
    if (!pointer.captured) {
      viewport.setPointerCapture?.(event.pointerId);
      pointerRef.current.captured = true;
    }
    viewport.classList.add("is-dragging");
    viewport.scrollLeft = pointer.startScrollLeft - distance;
  }

  function normalizeViewportPosition() {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const segment = track.scrollWidth / repeatCount;
    if (!segment) return;

    if (viewport.scrollLeft >= segment) viewport.scrollLeft -= segment;
  }

  function handlePointerUp(event) {
    const wasCaptured = pointerRef.current.captured;
    pointerRef.current.active = false;
    pointerRef.current.captured = false;
    pointerRef.current.pointerId = null;
    viewportRef.current?.classList.remove("is-dragging");
    if (wasCaptured) viewportRef.current?.releasePointerCapture?.(event.pointerId);
    requestAnimationFrame(normalizeViewportPosition);

    window.setTimeout(() => {
      draggedRef.current = false;
    }, 120);
  }

  function navigateServices(direction) {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const firstCard = track?.querySelector(".public-service-card");
    if (!viewport || !track || !firstCard) return;

    const trackStyles = window.getComputedStyle(track);
    const gap = Number.parseFloat(trackStyles.columnGap || trackStyles.gap || "0") || 0;
    const step = firstCard.getBoundingClientRect().width + gap;
    const segment = track.scrollWidth / repeatCount;

    if (direction < 0 && viewport.scrollLeft < step) {
      viewport.scrollLeft += segment;
    } else if (direction > 0 && viewport.scrollLeft >= segment) {
      viewport.scrollLeft -= segment;
    }

    viewport.classList.add("is-navigating");
    viewport.scrollBy({ left: direction * step, behavior: "smooth" });

    if (navigationTimerRef.current) window.clearTimeout(navigationTimerRef.current);
    navigationTimerRef.current = window.setTimeout(() => {
      normalizeViewportPosition();
      viewport.classList.remove("is-navigating");
      navigationTimerRef.current = null;
    }, 650);
  }

  function handleBookingClick(event) {
    event.preventDefault();
    setSelected(null);

    window.setTimeout(() => {
      const bookingSection = document.getElementById("agendar");
      if (!bookingSection) return;
      bookingSection.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", "#agendar");
    }, 80);
  }

  return (
    <section id="servicos" className="public-services-section relative overflow-hidden py-24 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_0%,color-mix(in_srgb,var(--clinic-accent)_22%,transparent),transparent_32rem),radial-gradient(circle_at_85%_18%,color-mix(in_srgb,var(--clinic-primary)_24%,transparent),transparent_30rem)]" />
      <div className="relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-[var(--clinic-accent)]">Nossos serviços</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{servicePlural} em destaque</h2>
          <p className="mt-4 text-base leading-8 text-white/68">Clique para conhecer cada {serviceSingular.toLocaleLowerCase("pt-BR")}.</p>
        </div>
      </div>

      <div className="public-services-carousel relative z-10 mt-6">
        <div
          ref={viewportRef}
          className="public-services-viewport relative overflow-x-auto py-23"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onMouseLeave={(event) => {
            if (pointerRef.current.active) handlePointerUp(event);
          }}
        >
          <div ref={trackRef} className="public-services-track flex w-max items-start gap-5 px-16 sm:px-24">
          {servicesLoop.map((item, index) => (
            <button
              key={`${item.id}-${index}`}
              type="button"
              data-featured={item.destaque_site ? "true" : "false"}
              onClick={() => {
                if (draggedRef.current) return;
                setSelected(item);
              }}
              className="group public-card-reveal public-reveal-up public-service-card public-service-card-dark w-[330px] shrink-0 overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.075] p-0 text-left text-white backdrop-blur-2xl md:w-[390px]"
            >
              {item.destaque_site ? <span className="public-service-reflection" aria-hidden="true" /> : null}
              <div className="relative aspect-square w-full overflow-hidden border-b border-white/10 bg-black/20">
                {item.imagem_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={publicImageUrl(item.imagem_url, { width: 520, height: 520, quality: 68 })}
                    srcSet={publicImageSrcSet(item.imagem_url, [360, 520, 780], { aspectRatio: 1, quality: 68 })}
                    sizes="(max-width: 640px) 330px, 390px"
                    alt={item.nome}
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_30%_20%,color-mix(in_srgb,var(--clinic-accent)_20%,transparent),transparent_45%),linear-gradient(145deg,#17130f,#24201c)] px-10 text-center">
                    <span className="text-xs font-black uppercase tracking-[0.28em] text-[var(--clinic-accent)]">{item.categoria || serviceSingular}</span>
                    <strong className="mt-4 text-2xl font-semibold text-white/88">{item.nome}</strong>
                  </div>
                )}
              </div>
              <div className="flex h-[370px] flex-col p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--clinic-accent)]">{item.categoria || serviceSingular}</p>
                    <h3
                      className="mt-3 h-16 overflow-hidden text-2xl font-semibold text-white"
                      style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}
                    >
                      {item.nome}
                    </h3>
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/78">{item.duracao_minutos} min</span>
                </div>
                <p
                  className="mt-5 h-[5.25rem] text-sm leading-7 text-white/62"
                  style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden" }}
                >
                  {item.descricao || `${serviceSingular} com avaliação e orientações personalizadas.`}
                </p>
                <span className="mt-3 inline-flex text-xs font-black text-[var(--clinic-accent)]">Ver mais...</span>
                <div className="mt-auto flex items-end justify-between gap-4 border-t border-white/10 pt-5">
                  <div>
                    <p className="text-xs text-white/42">Valor</p>
                    <strong className="text-2xl text-white">{money(displayPrice(item))}</strong>
                  </div>
                  <p className="max-w-36 text-right text-xs font-semibold text-white/50">{serviceLabel(item)}</p>
                </div>
              </div>
            </button>
            ))}
          </div>
        </div>

        {procedimentos.length > 1 ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-30 flex -translate-y-1/2 items-center justify-between px-2 sm:px-5">
            <button
              type="button"
              onClick={() => navigateServices(-1)}
              className="public-services-arrow pointer-events-auto grid size-12 place-items-center rounded-full border border-white/15 bg-black/72 text-white shadow-[0_16px_42px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:size-14"
              aria-label={`Ver ${serviceSingular.toLocaleLowerCase("pt-BR")} anterior`}
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => navigateServices(1)}
              className="public-services-arrow pointer-events-auto grid size-12 place-items-center rounded-full border border-white/15 bg-black/72 text-white shadow-[0_16px_42px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:size-14"
              aria-label={`Ver próximo ${serviceSingular.toLocaleLowerCase("pt-BR")}`}
            >
              <ChevronRight className="size-6" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      {selected && canUsePortal ? createPortal(
        <div className="public-site-modal fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-5 py-10 backdrop-blur-sm" role="dialog" aria-modal="true" onMouseDown={() => setSelected(null)}>
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar detalhes" onClick={() => setSelected(null)} />
          <div className="relative max-h-[90vh] w-full max-w-5xl overflow-auto rounded-[2rem] border border-white/12 bg-[#15120f] p-6 text-white shadow-[0_34px_100px_rgba(0,0,0,0.45)]" onMouseDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xl font-black text-white transition hover:bg-white/18"
              aria-label="Fechar"
            >
              ×
            </button>
            <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="flex w-full items-start justify-center self-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicImageUrl(selected.imagem_url || fallbackImage(selected.nome, true), { width: 720, height: 960, quality: 74 })}
                  srcSet={publicImageSrcSet(selected.imagem_url, [420, 720], { aspectRatio: 0.75, quality: 74 })}
                  sizes="(max-width: 1024px) 90vw, 420px"
                  alt={selected.nome}
                  decoding="async"
                  className="aspect-[3/4] h-auto w-full max-w-[420px] rounded-[1.5rem] object-cover"
                />
              </div>
              <div className="pr-0 lg:pr-6">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--clinic-accent)]">{selected.categoria || serviceSingular}</p>
                <h3 className="mt-3 text-4xl font-black tracking-tight">{selected.nome}</h3>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/42">O que é</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-white/72">{selected.descricao || `${serviceSingular} com avaliação e orientações personalizadas.`}</p>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/42">Cuidados antes</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/72">{selected.cuidados_antes || "A clínica orientará os cuidados necessários durante a avaliação."}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/42">Cuidados depois</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/72">{selected.cuidados_depois || `Após o atendimento, siga as orientações do ${professionalLower}.`}</p>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
                  <strong className="text-2xl">{money(displayPrice(selected))}</strong>
                  <a href="#agendar" onClick={handleBookingClick} className="public-modal-booking-cta relative z-20 inline-flex items-center justify-center rounded-full border border-white/15 bg-[var(--clinic-accent)] px-6 py-3 text-sm font-black text-white shadow-[0_18px_42px_color-mix(in_srgb,var(--clinic-accent)_38%,transparent)] transition duration-300">Agendar este {serviceSingular.toLocaleLowerCase("pt-BR")}</a>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </section>
  );
}
