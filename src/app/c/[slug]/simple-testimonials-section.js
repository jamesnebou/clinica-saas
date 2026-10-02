import { ExternalLink, Star } from "lucide-react";

export function SimpleTestimonialsSection({ testimonials, writeUrl, viewUrl, clientLabel }) {
  if (!testimonials.length && !writeUrl && !viewUrl) return null;

  return (
    <section id="depoimentos" className="public-section-soft mx-auto max-w-7xl px-5 py-20 sm:px-8">
      <div className="text-center">
        <p className="text-xs font-bold uppercase text-[var(--clinic-primary)]">Depoimentos</p>
        <h2 className="mt-3 text-3xl font-semibold text-neutral-950">Veja o que nossos {clientLabel} dizem</h2>
      </div>

      {testimonials.length ? <div className="mt-10 grid gap-5 md:grid-cols-2">
        {testimonials.map((item, index) => <article key={`${item.nome || "depoimento"}-${index}`} className="rounded-md border border-neutral-200 bg-white/80 p-6 shadow-sm">
          <p className="text-sm leading-7 text-neutral-700">{item.texto}</p>
          <div className="mt-5">
            {item.nome ? <strong className="text-sm text-neutral-950">{item.nome}</strong> : null}
            {item.procedimento ? <p className="mt-1 text-xs text-neutral-500">{item.procedimento}</p> : null}
          </div>
        </article>)}
      </div> : null}

      {writeUrl || viewUrl ? <div className="mt-8 flex flex-wrap justify-center gap-3">
        {writeUrl ? <a href={writeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--clinic-primary)] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-95"><Star size={17} /> Me avalie no Google!</a> : null}
        {viewUrl ? <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold text-neutral-800 transition hover:border-neutral-800"><ExternalLink size={16} /> Ver avaliações do Google</a> : null}
      </div> : null}
    </section>
  );
}
