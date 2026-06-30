"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { createPublicLeadAction } from "./actions";

export function PublicLeadForm({ slug, query }) {
  const [open, setOpen] = useState(Boolean(query?.lead || query?.lead_erro));

  useEffect(() => {
    function isLeadReference(value) {
      const normalized = String(value || "").trim().toLowerCase();
      return ["popup", "form", "formulario", "formulário", "lead", "#popup", "#form", "#formulario", "#formulário", "#lead"].includes(normalized);
    }

    function handleClick(event) {
      const link = event.target.closest?.("a");
      if (!link) return;

      if (!isLeadReference(link.getAttribute("href"))) return;

      event.preventDefault();
      setOpen(true);
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
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
    if (query?.lead || query?.lead_erro) history.replaceState(null, "", window.location.pathname);
  }

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-[#0f0b08]/75 px-5 py-8 backdrop-blur-md" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar formulário" onClick={close} />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/12 bg-[#15120f] p-6 text-white shadow-[0_34px_120px_rgba(0,0,0,0.55)] sm:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,color-mix(in_srgb,var(--clinic-accent)_28%,transparent),transparent_18rem),radial-gradient(circle_at_100%_18%,color-mix(in_srgb,var(--clinic-primary)_26%,transparent),transparent_20rem)]" />
            <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(120deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:18px_18px]" />
            <div className="relative">
              <button type="button" onClick={close} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/18" aria-label="Fechar">
                <X size={18} />
              </button>

              <div className="pr-12">
                <p className="text-xs font-black uppercase tracking-[0.32em] text-[var(--clinic-accent)]">Atendimento</p>
                <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Quero saber mais</h2>
                <p className="mt-4 max-w-xl text-sm leading-7 text-white/68">Envie seus dados e conte o que você procura. A equipe da clínica entra em contato para orientar o melhor próximo passo.</p>
              </div>

              {query?.lead === "ok" ? (
                <div className="mt-6 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">Recebemos sua solicitação. A clínica entrará em contato em breve.</div>
              ) : null}
              {query?.lead_erro ? (
                <div className="mt-6 rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{query?.mensagem || "Não foi possível enviar sua solicitação agora."}</div>
              ) : null}

              <form action={createPublicLeadAction} className="mt-7 grid gap-4">
                <input type="hidden" name="slug" value={slug} />
                <label className="block">
                  <span className="text-sm font-bold text-white/78">Nome completo</span>
                  <input name="nome" required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none transition focus:border-[var(--clinic-accent)] focus:bg-white/[0.14]" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-bold text-white/78">Telefone</span>
                    <input name="telefone" required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none transition focus:border-[var(--clinic-accent)] focus:bg-white/[0.14]" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold text-white/78">E-mail</span>
                    <input name="email" type="email" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none transition focus:border-[var(--clinic-accent)] focus:bg-white/[0.14]" />
                  </label>
                </div>
                <label className="block">
                  <span className="text-sm font-bold text-white/78">Mensagem</span>
                  <textarea name="mensagem" rows={5} className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-[var(--clinic-accent)] focus:bg-white/[0.14]" />
                </label>
                <p className="text-xs leading-5 text-white/45">Ao enviar, você autoriza o contato da clínica pelos dados informados.</p>
                <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--clinic-accent)] px-6 py-4 text-sm font-black text-[#17130f] shadow-[0_18px_48px_color-mix(in_srgb,var(--clinic-accent)_28%,transparent)]">
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
