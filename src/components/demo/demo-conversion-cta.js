"use client";

import { MessageCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { trackMarketingEvent } from "@/components/marketing/conversion-tracker";

export function DemoConversionCta() {
  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#111315]/95 p-3 text-white shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:bottom-6 sm:right-6">
      <p className="hidden px-2 pb-2 text-xs font-semibold text-white/58 sm:block">Gostou do que viu? Leve essa operação para sua clínica.</p>
      <div className="flex gap-2">
        <Link href="/?contato=1#contato" onClick={() => trackMarketingEvent("demo_cta_click", { destination: "form" })} className="inline-flex h-10 items-center gap-2 rounded-full bg-orange-400 px-4 text-xs font-black text-[#1c1c1c]"><Sparkles size={15} /> Quero na minha clínica</Link>
        <a href="https://wa.me/5577988656394?text=Ol%C3%A1%2C%20testei%20a%20demo%20da%20NexaWi%20Cl%C3%ADnicas%20e%20quero%20saber%20mais." target="_blank" rel="noreferrer" onClick={() => trackMarketingEvent("demo_cta_click", { destination: "whatsapp" })} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 text-white/75 hover:bg-white/10" aria-label="Falar no WhatsApp"><MessageCircle size={17} /></a>
      </div>
    </div>
  );
}
