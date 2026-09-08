"use client";

import { useEffect, useState } from "react";
import { Settings2, ShieldCheck, X } from "lucide-react";
import { getTrackingConsent, saveTrackingConsent } from "@/lib/tracking/consent";

export function ConsentManager() {
  const [consent, setConsent] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = getTrackingConsent();
      setConsent(stored);
      setOpen(!stored.decided);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!consent) return null;

  function persist(next) {
    const saved = saveTrackingConsent(next);
    setConsent(saved);
    setOpen(false);
  }

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end bg-black/35 p-3 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="tracking-consent-title">
          <section className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-5 text-neutral-950 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[#c85800]" size={22} /><div><h2 id="tracking-consent-title" className="text-lg font-black">Privacidade e medição</h2><p className="mt-1 text-sm leading-6 text-neutral-600">Você escolhe como a NexaWi mede a experiência e campanhas. Recursos essenciais continuam funcionando.</p></div></div>
              {consent.decided ? <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200" aria-label="Fechar preferências"><X size={17} /></button> : null}
            </div>
            <div className="mt-5 grid gap-3">
              <label className="flex items-center justify-between gap-4 rounded-md border border-neutral-200 p-4"><span><strong className="block text-sm">Necessários</strong><span className="text-xs text-neutral-500">Segurança, sessão e funcionamento.</span></span><input type="checkbox" checked disabled className="h-4 w-4" /></label>
              <label className="flex items-center justify-between gap-4 rounded-md border border-neutral-200 p-4"><span><strong className="block text-sm">Análise</strong><span className="text-xs text-neutral-500">GA4, desempenho e uso agregado.</span></span><input type="checkbox" checked={consent.analytics} onChange={(event) => setConsent((current) => ({ ...current, analytics: event.target.checked }))} className="h-4 w-4 accent-[#ed7009]" /></label>
              <label className="flex items-center justify-between gap-4 rounded-md border border-neutral-200 p-4"><span><strong className="block text-sm">Marketing</strong><span className="text-xs text-neutral-500">Meta, Google Ads e atribuição de campanhas.</span></span><input type="checkbox" checked={consent.marketing} onChange={(event) => setConsent((current) => ({ ...current, marketing: event.target.checked }))} className="h-4 w-4 accent-[#ed7009]" /></label>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3"><button type="button" onClick={() => persist({ analytics: false, marketing: false })} className="h-11 rounded-md border border-neutral-300 text-sm font-bold">Somente necessários</button><button type="button" onClick={() => persist(consent)} className="h-11 rounded-md border border-neutral-950 text-sm font-bold">Salvar escolhas</button><button type="button" onClick={() => persist({ analytics: true, marketing: true })} className="h-11 rounded-md bg-neutral-950 text-sm font-bold text-white">Aceitar todos</button></div>
          </section>
        </div>
      ) : null}
      {consent.decided && !open ? <button type="button" onClick={() => setOpen(true)} className="fixed bottom-4 left-4 z-[90] flex h-10 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-xs font-bold text-neutral-800 shadow-lg" aria-label="Editar preferências de privacidade"><Settings2 size={15} /> Privacidade</button> : null}
    </>
  );
}
