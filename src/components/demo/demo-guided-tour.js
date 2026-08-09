"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, ChartNoAxesCombined, CircleDollarSign, Globe2, X } from "lucide-react";
import { trackMarketingEvent } from "@/components/marketing/conversion-tracker";

const steps = [
  { title: "Visão geral", description: "Veja os indicadores que um dono acompanha antes de começar o dia.", href: "/dashboard", icon: ChartNoAxesCombined },
  { title: "Agenda", description: "Confira horários, profissionais, procedimentos, status e pagamentos no mesmo calendário.", href: "/dashboard/agenda", icon: CalendarDays },
  { title: "CRM", description: "Entenda como leads e próximas ações evitam clientes esquecidos no WhatsApp.", href: "/dashboard/crm", icon: ArrowRight },
  { title: "Financeiro", description: "Visualize o que foi recebido, o que está previsto e como a comissão é acompanhada.", href: "/dashboard/financeiro", icon: CircleDollarSign },
  { title: "Site público", description: "Abra a vitrine que o cliente vê para escolher procedimentos, produtos e horários.", href: "/c/demo-nexawi-clinicas", icon: Globe2 },
];

export function DemoGuidedTour() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let shouldOpen = false;
    try {
      shouldOpen = new URLSearchParams(window.location.search).get("tour") === "1" || window.localStorage.getItem("nexawi_demo_tour_complete") !== "1";
    } catch {
      shouldOpen = true;
    }
    const timer = window.setTimeout(() => setOpen(shouldOpen), 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!open) return null;
  const current = steps[step];
  const Icon = current.icon;

  function close(completed = false) {
    if (completed) {
      try { window.localStorage.setItem("nexawi_demo_tour_complete", "1"); } catch {}
    }
    setOpen(false);
  }

  function next() {
    trackMarketingEvent("demo_module_view", { module: current.title, step: step + 1, pathname });
    if (current.href.startsWith("/c/")) window.open(current.href, "_blank", "noopener,noreferrer");
    else router.push(current.href);

    if (step === steps.length - 1) close(true);
    else setStep((value) => value + 1);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-black/55 p-4 backdrop-blur-sm sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="demo-tour-title">
      <div className="w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#111315] text-white shadow-[0_35px_120px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">Tour da demonstração · {step + 1}/{steps.length}</p>
          <button onClick={() => close()} className="rounded-full border border-white/10 p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Fechar tour"><X size={17} /></button>
        </div>
        <div className="p-6 sm:p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-400/12 text-orange-300"><Icon size={26} /></div>
          <h2 id="demo-tour-title" className="mt-5 text-3xl font-black">{current.title}</h2>
          <p className="mt-3 text-sm leading-7 text-white/65">{current.description}</p>
          <div className="mt-7 flex gap-2">
            {steps.map((item, index) => <span key={item.title} className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-orange-400" : "bg-white/12"}`} />)}
          </div>
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button onClick={() => close()} className="h-11 rounded-full px-5 text-sm font-bold text-white/55 hover:text-white">Explorar por conta própria</button>
            <button onClick={next} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-orange-400 px-6 text-sm font-black text-[#1c1c1c]">{step === steps.length - 1 ? "Abrir site e concluir" : "Abrir este módulo"}<ArrowRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
