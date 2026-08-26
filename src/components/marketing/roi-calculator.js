"use client";

import { useMemo, useState } from "react";
import { Calculator, TrendingUp } from "lucide-react";
import { trackMarketingEvent } from "./conversion-tracker";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function RoiCalculator() {
  const [ticket, setTicket] = useState(280);
  const [emptySlots, setEmptySlots] = useState(8);
  const [recovery, setRecovery] = useState(30);
  const result = useMemo(() => {
    const monthlyLoss = Math.max(0, ticket) * Math.max(0, emptySlots) * 4.33;
    const recoverable = monthlyLoss * Math.min(100, Math.max(0, recovery)) / 100;
    return { monthlyLoss, recoverable };
  }, [ticket, emptySlots, recovery]);

  function registerCalculation() {
    trackMarketingEvent("roi_calculate", { ticket, empty_slots_week: emptySlots, recovery_percent: recovery, estimated_recovery: Math.round(result.recoverable) });
  }


  
  return (
    <section className="marketing-section bg-[#1c1c1c] px-5 py-20 text-white sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">Custo da cadeira vazia</p>
          <h2 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">Quanto sua clínica pode estar deixando na mesa?</h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-white/68">Faça uma estimativa simples. O cálculo não promete resultado: ele mostra o tamanho do espaço que agenda, sinal e retorno organizado podem ajudar a recuperar.</p>
        </div>
        <div className="rounded-[2rem] border border-white/12 bg-white/[0.07] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.3)] backdrop-blur sm:p-7">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-bold text-white/78">Ticket médio
              <input type="number" min="0" value={ticket} onChange={(event) => setTicket(Number(event.target.value))} className="mt-2 h-12 w-full rounded-xl border border-white/12 bg-black/25 px-4 text-white outline-none focus:border-orange-400" />
            </label>
            <label className="text-sm font-bold text-white/78">Horários vazios/semana
              <input type="number" min="0" value={emptySlots} onChange={(event) => setEmptySlots(Number(event.target.value))} className="mt-2 h-12 w-full rounded-xl border border-white/12 bg-black/25 px-4 text-white outline-none focus:border-orange-400" />
            </label>
            <label className="text-sm font-bold text-white/78">Recuperação estimada (%)
              <input type="number" min="0" max="100" value={recovery} onChange={(event) => setRecovery(Number(event.target.value))} className="mt-2 h-12 w-full rounded-xl border border-white/12 bg-black/25 px-4 text-white outline-none focus:border-orange-400" />
            </label>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-black/20 p-5">
              <Calculator className="text-orange-300" size={21} />
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-white/48">Receita potencial não realizada/mês</p>
              <strong className="mt-2 block text-3xl font-black">{money.format(result.monthlyLoss)}</strong>
            </div>
            <div className="rounded-2xl bg-[var(--nexawi-primary)] p-5">
              <TrendingUp size={21} />
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-white/75">Espaço estimado de recuperação/mês</p>
              <strong className="mt-2 block text-3xl font-black">{money.format(result.recoverable)}</strong>
            </div>
          </div>
          <a href="#contato" onClick={registerCalculation} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-white px-5 text-sm font-black text-[#1c1c1c]">Quero organizar essa operação</a>
        </div>
      </div>
    </section>
  );
}
