"use client";

import { useEffect, useState } from "react";

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
  const servicesLoop = [...procedimentos, ...procedimentos];

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

  return (
    <section id="servicos" className="public-services-section relative overflow-hidden py-24 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_0%,color-mix(in_srgb,var(--clinic-accent)_22%,transparent),transparent_32rem),radial-gradient(circle_at_85%_18%,color-mix(in_srgb,var(--clinic-primary)_24%,transparent),transparent_30rem)]" />
      <div className="relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-[var(--clinic-accent)]">Nossos serviços</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Protocolos em destaque</h2>
          <p className="mt-4 text-base leading-8 text-white/68">Passe pelos tratamentos e escolha o melhor ponto de partida para sua avaliação.</p>
        </div>
      </div>

      <div className="relative z-10 mt-12 overflow-hidden">
        <div className="public-services-track flex w-max gap-5 px-5 sm:px-8">
          {servicesLoop.map((item, index) => (
            <button
              key={`${item.id}-${index}`}
              type="button"
              data-featured={item.destaque_site ? "true" : "false"}
              onClick={() => setSelected(item)}
              className="public-card-reveal public-reveal-up public-service-card public-service-card-dark w-[330px] shrink-0 rounded-[1.75rem] border border-white/10 bg-white/[0.075] p-6 text-left text-white backdrop-blur-2xl md:w-[390px]"
            >
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

      {selected ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-5 py-10 backdrop-blur-sm" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar detalhes" onClick={() => setSelected(null)} />
          <div className="relative max-h-[90vh] w-full max-w-5xl overflow-auto rounded-[2rem] border border-white/12 bg-[#15120f] p-6 text-white shadow-[0_34px_100px_rgba(0,0,0,0.45)]">
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
                  <a href="#agendar" onClick={() => setSelected(null)} className="rounded-full bg-[var(--clinic-accent)] px-5 py-3 text-sm font-black text-[#17130f]">Agendar este procedimento</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
