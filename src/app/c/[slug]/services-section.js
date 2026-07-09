"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

export function PublicServicesSection({ procedimentos = [] }) {
  const [selected, setSelected] = useState(null);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const animationRef = useRef(null);
  const pointerRef = useRef({ active: false, captured: false, pointerId: null, startX: 0, startScrollLeft: 0 });
  const draggedRef = useRef(false);
  const hoverRef = useRef(false);
  const repeatCount = procedimentos.length <= 2 ? 12 : procedimentos.length <= 4 ? 9 : 6;
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
    const startOffset = () => segmentWidth() * Math.floor(repeatCount / 2);

    const normalizeScroll = () => {
      const segment = segmentWidth();
      if (!segment) return;

      const min = segment * 2;
      const max = segment * (repeatCount - 2);

      if (viewport.scrollLeft < min) {
        viewport.scrollLeft += segment;
      } else if (viewport.scrollLeft > max) {
        viewport.scrollLeft -= segment;
      }
    };

    const setInitialPosition = () => {
      viewport.scrollLeft = startOffset();
    };

    setInitialPosition();


    let lastTime = performance.now();
    const speed = 58;

    const animate = (time) => {
      const delta = Math.min(64, time - lastTime);
      lastTime = time;

      if (!pointerRef.current.active && !hoverRef.current && !selected) {
        viewport.scrollLeft += (speed * delta) / 1000;
        normalizeScroll();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    window.addEventListener("resize", setInitialPosition);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", setInitialPosition);
    };
  }, [procedimentos, repeatCount, selected]);

  function handlePointerDown(event) {
    const viewport = viewportRef.current;
    if (!viewport) return;

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
    viewport.scrollLeft = pointer.startScrollLeft - distance;
  }

  function normalizeViewportPosition() {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const segment = track.scrollWidth / repeatCount;
    if (!segment) return;

    const min = segment * 2;
    const max = segment * (repeatCount - 2);

    if (viewport.scrollLeft < min) viewport.scrollLeft += segment;
    if (viewport.scrollLeft > max) viewport.scrollLeft -= segment;
  }

  function handlePointerUp(event) {
    const wasCaptured = pointerRef.current.captured;
    pointerRef.current.active = false;
    pointerRef.current.captured = false;
    pointerRef.current.pointerId = null;
    if (wasCaptured) viewportRef.current?.releasePointerCapture?.(event.pointerId);
    requestAnimationFrame(normalizeViewportPosition);

    window.setTimeout(() => {
      draggedRef.current = false;
    }, 120);
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
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Protocolos em destaque</h2>
          <p className="mt-4 text-base leading-8 text-white/68">Clique no procedimento para saber mais.</p>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="public-services-viewport relative z-10 mt-6 overflow-x-auto py-23"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseEnter={() => { hoverRef.current = true; }}
        onMouseLeave={(event) => {
          hoverRef.current = false;
          if (pointerRef.current.active) handlePointerUp(event);
        }}
        onFocusCapture={() => { hoverRef.current = true; }}
        onBlurCapture={() => { hoverRef.current = false; }}
      >
        <div ref={trackRef} className="public-services-track flex w-max gap-5 px-16 sm:px-24">
          {servicesLoop.map((item, index) => (
            <button
              key={`${item.id}-${index}`}
              type="button"
              data-featured={item.destaque_site ? "true" : "false"}
              onClick={() => {
                if (draggedRef.current) return;
                setSelected(item);
              }}
              className="public-card-reveal public-reveal-up public-service-card public-service-card-dark w-[330px] shrink-0 rounded-[1.75rem] border border-white/10 bg-white/[0.075] p-6 text-left text-white backdrop-blur-2xl md:w-[390px]"
            >
              {item.destaque_site ? <span className="public-service-reflection" aria-hidden="true" /> : null}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--clinic-accent)]">{item.categoria || "Procedimento"}</p>
                  <h3 className="mt-3 text-2xl font-semibold text-white">{item.nome}</h3>
                </div>
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/78">{item.duracao_minutos} min</span>
              </div>
              <p className="mt-5 min-h-24 text-sm leading-7 text-white/62">{item.descricao || "Procedimento com avaliação profissional e orientações personalizadas."}</p>
              <div className="mt-7 flex items-end justify-between gap-4 border-t border-white/10 pt-5">
                <div>
                  <p className="text-xs text-white/42">Valor</p>
                  <strong className="text-2xl text-white">{money(item.preco)}</strong>
                </div>
                <p className="max-w-36 text-right text-xs font-semibold text-white/50">{serviceLabel(item)}</p>
              </div>
              <span className="mt-5 inline-flex rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-white/70">Ver detalhes</span>
            </button>
          ))}
        </div>
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.imagem_url || fallbackImage(selected.nome, true)} alt={selected.nome} className="h-full min-h-[320px] w-full rounded-[1.5rem] object-cover" />
              <div className="pr-0 lg:pr-6">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--clinic-accent)]">{selected.categoria || "Procedimento"}</p>
                <h3 className="mt-3 text-4xl font-black tracking-tight">{selected.nome}</h3>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/42">O que é</p>
                  <p className="mt-2 text-sm leading-7 text-white/72">{selected.descricao || "Procedimento com avaliação profissional e orientações personalizadas."}</p>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/42">Cuidados antes</p>
                    <p className="mt-2 text-sm leading-6 text-white/72">{selected.cuidados_antes || "A clínica orientará os cuidados necessários durante a avaliação."}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/42">Cuidados depois</p>
                    <p className="mt-2 text-sm leading-6 text-white/72">{selected.cuidados_depois || "Após o atendimento, siga as orientações da profissional para melhores resultados."}</p>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
                  <strong className="text-2xl">{money(selected.preco)}</strong>
                  <a href="#agendar" onClick={handleBookingClick} className="public-modal-booking-cta relative z-20 inline-flex items-center justify-center rounded-full border border-white/15 bg-[var(--clinic-accent)] px-6 py-3 text-sm font-black text-white shadow-[0_18px_42px_color-mix(in_srgb,var(--clinic-accent)_38%,transparent)] transition duration-300">Agendar este procedimento</a>
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
