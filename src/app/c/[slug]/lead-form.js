"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { createPublicLeadAction } from "./actions";

export function PublicLeadForm({ slug, query }) {
  const [open, setOpen] = useState(Boolean(query?.lead || query?.lead_erro));

  useEffect(() => {
    function isLeadReference(value) {
      const normalized = String(value || "").trim().toLowerCase();
      return ["popup", "form", "formulario", "formulário", "lead", "modal", "contato", "#popup", "#form", "#formulario", "#formulário", "#lead", "#modal", "#contato"].includes(normalized);
    }

    function openFromLocation() {
      if (isLeadReference(window.location.hash)) setOpen(true);
    }

    function handleClick(event) {
      const link = event.target.closest?.("a");
      if (!link) return;

      if (!link.dataset.leadPopup && !isLeadReference(link.getAttribute("href"))) return;

      event.preventDefault();
      setOpen(true);
    }

    openFromLocation();
    document.addEventListener("click", handleClick);
    window.addEventListener("hashchange", openFromLocation);
    return () => {
      document.removeEventListener("click", handleClick);
      window.removeEventListener("hashchange", openFromLocation);
    };
  }, [query?.lead, query?.lead_erro]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function close() {
    setOpen(false);
    if (query?.lead || query?.lead_erro || ["#popup", "#form", "#lead", "#modal", "#contato"].includes(window.location.hash.toLowerCase())) {
      history.replaceState(null, "", window.location.pathname);
    }
  }

  return (
    <>
      {open ? (
        <div className="public-site-modal fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-[#0f0b08]/75 px-4 py-5 backdrop-blur-md sm:px-5 sm:py-8" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar formulário" onClick={close} />
          <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto overflow-x-hidden rounded-[1.5rem] border border-white/12 bg-[#15120f] p-5 text-white shadow-[0_34px_120px_rgba(0,0,0,0.55)] sm:rounded-[2rem] sm:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,color-mix(in_srgb,var(--clinic-accent)_28%,transparent),transparent_18rem),radial-gradient(circle_at_100%_18%,color-mix(in_srgb,var(--clinic-primary)_26%,transparent),transparent_20rem)]" />
            <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(120deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:18px_18px]" />
            <div className="relative">
              <button type="button" onClick={close} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/18" aria-label="Fechar">
                <X size={18} />
              </button>

              <div className="pr-12">
                <p className="text-xs font-black uppercase tracking-[0.32em] text-[var(--clinic-accent)]">Atendimento</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight sm:mt-3 sm:text-5xl">Quero saber mais</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-white/68 sm:mt-4 sm:leading-7">Envie seus dados e conte o que você procura. A equipe da clínica entra em contato para orientar o melhor próximo passo.</p>
              </div>

              {query?.lead === "ok" ? (
                <div className="mt-6 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">Recebemos sua solicitação. A clínica entrará em contato em breve.</div>
              ) : null}
              {query?.lead_erro ? (
                <div className="mt-6 rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{query?.mensagem || "Não foi possível enviar sua solicitação agora."}</div>
              ) : null}

              <form action={createPublicLeadAction} className="mt-5 grid gap-3 sm:mt-7 sm:gap-4">
                <input type="hidden" name="slug" value={slug} />
                <input name="nome" required aria-label="Nome completo" placeholder="Nome completo" className="h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none transition placeholder:text-white/42 focus:border-[var(--clinic-accent)] focus:bg-white/[0.14]" />
                <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                  <input name="telefone" required aria-label="Telefone" placeholder="Telefone" className="h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none transition placeholder:text-white/42 focus:border-[var(--clinic-accent)] focus:bg-white/[0.14]" />
                  <input name="email" type="email" aria-label="E-mail" placeholder="E-mail" className="h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none transition placeholder:text-white/42 focus:border-[var(--clinic-accent)] focus:bg-white/[0.14]" />
                </div>
                <textarea name="mensagem" rows={4} aria-label="Mensagem" placeholder="Mensagem" className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/42 focus:border-[var(--clinic-accent)] focus:bg-white/[0.14]" />
                <p className="text-xs leading-5 text-white/45">Ao enviar, você autoriza o contato da clínica pelos dados informados.</p>
                <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--clinic-accent)] px-6 py-3.5 text-sm font-black text-[#17130f] shadow-[0_18px_48px_color-mix(in_srgb,var(--clinic-accent)_28%,transparent)] sm:py-4">
                  <MessageCircle size={18} /> Quero saber mais
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
