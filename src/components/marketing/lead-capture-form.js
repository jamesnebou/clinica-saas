"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, MessageCircle } from "lucide-react";
import { createMarketingEventId, getMarketingAttribution, getMarketingSessionId } from "@/lib/tracking/client-attribution";
import { trackMarketingEvent, trackMetaStandardEvent } from "./conversion-tracker";

const WHATSAPP_URL = "https://wa.me/5577988656394?text=Ol%C3%A1%2C%20quero%20conhecer%20a%20NexaWi%20Cl%C3%ADnicas.";

export function LeadCaptureForm({
  segment = "geral",
  eyebrow = "Próximo passo",
  title = "Veja como a NexaWi se encaixa na rotina da sua clínica.",
  description = "Conte rapidamente como é sua operação. A conversa é objetiva e sem compromisso.",
} = {}) {
  const [plan, setPlan] = useState("nao_sei");
  const [state, setState] = useState({ status: "idle", message: "" });

  useEffect(() => {
    function selected(event) {
      setPlan(event.detail || "nao_sei");
    }
    const timer = window.setTimeout(() => {
      try { setPlan(window.localStorage.getItem("nexawi_selected_plan") || "nao_sei"); } catch {}
    }, 0);
    window.addEventListener("nexawi:plan-selected", selected);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("nexawi:plan-selected", selected);
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setState({ status: "loading", message: "" });
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const metaEventId = createMarketingEventId("lead");
    const attribution = getMarketingAttribution();

    try {
      const response = await fetch("/api/public/marketing-leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, plan_interest: plan, session_id: getMarketingSessionId(), meta_event_id: metaEventId, ...attribution, segment }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar agora.");
      setState({ status: "success", message: "Recebemos seus dados. Nossa equipe vai chamar você no WhatsApp." });
      trackMetaStandardEvent("Lead", { plan, segment: segment || attribution.segment || "geral" }, data.event_id || metaEventId);
      window.gtag?.("event", "generate_lead", { plan });
      formElement.reset();
    } catch (error) {
      setState({ status: "error", message: error.message || "Tente novamente em alguns instantes." });
    }
  }

  return (
    <section id="contato" className="marketing-section scroll-mt-24 px-5 py-20 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl overflow-hidden rounded-lg bg-[#1c1c1c] text-white shadow-[0_34px_100px_rgba(28,28,28,0.24)] lg:grid-cols-[0.8fr_1.2fr]">
        <div className="bg-[#202020] p-7 lg:p-10">
          <p className="text-xs font-black uppercase text-orange-300">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">{title}</h2>
          <p className="mt-5 text-base leading-8 text-white/68">{description}</p>
          <div className="mt-7 space-y-3 text-sm font-semibold text-white/76">
            {["Entendimento da sua agenda e equipe", "Indicação do plano mais adequado", "Demonstração guiada com perguntas reais"].map((item) => <p key={item} className="flex gap-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-orange-300" />{item}</p>)}
          </div>
        </div>
        <form onSubmit={submit} className="grid gap-4 bg-white/[0.07] p-7 backdrop-blur lg:p-10 sm:grid-cols-2">
          <input name="website" tabIndex="-1" autoComplete="off" className="hidden" aria-hidden="true" />
          <label className="text-sm font-bold text-white/80">Seu nome
            <input name="name" required minLength={2} maxLength={100} placeholder="Como podemos chamar você?" className="mt-2 h-12 w-full rounded-md border border-white/12 bg-black/25 px-4 text-white outline-none placeholder:text-white/30 focus:border-orange-400" />
          </label>
          <label className="text-sm font-bold text-white/80">WhatsApp
            <input name="whatsapp" required inputMode="tel" placeholder="(77) 99999-9999" className="mt-2 h-12 w-full rounded-md border border-white/12 bg-black/25 px-4 text-white outline-none placeholder:text-white/30 focus:border-orange-400" />
          </label>
          <label className="text-sm font-bold text-white/80">Nome da clínica
            <input name="clinic_name" maxLength={120} placeholder="Ex.: Clínica Bella Skin" className="mt-2 h-12 w-full rounded-md border border-white/12 bg-black/25 px-4 text-white outline-none placeholder:text-white/30 focus:border-orange-400" />
          </label>
          <label className="text-sm font-bold text-white/80">Quantidade de profissionais
            <select name="professionals_count" defaultValue="2" className="mt-2 h-12 w-full rounded-md border border-white/12 bg-[#202020] px-4 text-white outline-none focus:border-orange-400">
              <option value="1">1 profissional</option><option value="2">2 profissionais</option><option value="3">3 profissionais</option><option value="4">4 profissionais</option><option value="5">5 ou mais</option>
            </select>
          </label>
          <label className="text-sm font-bold text-white/80 sm:col-span-2">Plano de interesse
            <select value={plan} onChange={(event) => setPlan(event.target.value)} className="mt-2 h-12 w-full rounded-md border border-white/12 bg-[#202020] px-4 text-white outline-none focus:border-orange-400">
              <option value="nao_sei">Quero uma recomendação</option><option value="starter">Starter</option><option value="growth">Growth</option><option value="premium">Premium</option>
            </select>
          </label>
          <label className="flex items-start gap-2 text-xs leading-5 text-white/58 sm:col-span-2">
            <input name="consent" type="checkbox" required className="mt-1" /> Autorizo o contato da NexaWi sobre esta solicitação, conforme a Política de Privacidade.
          </label>
          {state.message ? <p role="status" className={`rounded-md px-4 py-3 text-sm font-bold sm:col-span-2 ${state.status === "success" ? "bg-emerald-500/15 text-emerald-200" : "bg-red-500/15 text-red-200"}`}>{state.message}</p> : null}
          <button disabled={state.status === "loading"} className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[var(--nexawi-primary)] px-6 text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-60 sm:col-span-2">
            {state.status === "loading" ? <LoaderCircle className="animate-spin" size={17} /> : <MessageCircle size={17} />} Quero falar sobre minha clínica
          </button>
          <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" onClick={() => trackMarketingEvent("whatsapp_click", { location: "lead_form" })} className="text-center text-xs font-bold text-white/55 underline underline-offset-4 sm:col-span-2">Prefere não preencher? Fale direto pelo WhatsApp.</a>
        </form>
      </div>
    </section>
  );
}
