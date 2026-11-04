"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpRight, Lightbulb, Sparkles } from "lucide-react";

const messages = {
  AI_NOT_CONFIGURED: "IA ainda não configurada neste ambiente.",
  AI_RATE_LIMITED: "O limite de análises foi atingido. Tente novamente mais tarde.",
  AI_FORBIDDEN: "Acesso negado.",
  AI_INVALID_PERIOD: "Selecione um período válido.",
  AI_UNAVAILABLE: "Não foi possível gerar a análise agora.",
};

function dateLabel(value, timezone) {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: timezone });
}

function ItemList({ title, icon: Icon, items, kind }) {
  if (!items?.length) return null;
  return (
    <section className="border-t border-neutral-200 py-5">
      <h3 className="flex items-center gap-2 text-base font-bold text-neutral-900"><Icon size={18} className="text-[var(--clinic-primary)]" />{title}</h3>
      <ul className="mt-3 space-y-3">
        {items.map((item, index) => (
          <li key={`${item.title || item.action}-${index}`} className="border-l-2 border-[var(--clinic-accent)] pl-3 text-sm">
            <p className="font-semibold text-neutral-900">{kind === "actions" ? `${item.priority}. ${item.action}` : item.title}</p>
            <p className="mt-1 leading-6 text-neutral-600">{kind === "actions" ? item.rationale : item.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ClinicSummaryPanel() {
  const [days, setDays] = useState(30);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/summary", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI_UNAVAILABLE");
      setResult(payload);
    } catch (cause) {
      setError(messages[cause.message] || messages.AI_UNAVAILABLE);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="mt-7 border-b border-neutral-200 pb-6">
        <p className="text-sm text-neutral-600">Selecione o período para analisar os dados disponíveis.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Período" className="inline-flex overflow-hidden rounded-md border border-neutral-300">
            {[7, 30].map((value) => <button key={value} type="button" disabled={loading} aria-pressed={days === value} onClick={() => { setDays(value); setResult(null); setError(""); }} className={`h-10 min-w-20 px-3 text-sm font-semibold disabled:opacity-60 ${days === value ? "bg-[var(--clinic-primary)] text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}>{value} dias</button>)}
          </div>
          <button type="button" onClick={submit} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-950 px-4 text-sm font-semibold text-white disabled:opacity-60">
            <Sparkles size={16} />{loading ? "Analisando..." : result ? "Atualizar análise" : "Gerar resumo inteligente"}
          </button>
        </div>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      </section>
      {result ? (
        <div aria-live="polite" className="mt-6">
          <h2 className="text-xl font-bold text-neutral-950">{result.analysis.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-700">{result.analysis.executiveSummary}</p>
          <div className="mt-6 grid gap-x-8 md:grid-cols-2">
            <ItemList title="Destaques" icon={Sparkles} items={result.analysis.highlights} />
            <ItemList title="Alertas" icon={AlertTriangle} items={result.analysis.alerts} />
            <ItemList title="Oportunidades" icon={Lightbulb} items={result.analysis.opportunities} />
            <ItemList title="Próximas ações" icon={ArrowUpRight} items={result.analysis.recommendedActions} kind="actions" />
          </div>
          <p className="mt-6 border-t border-neutral-200 pt-4 text-xs text-neutral-500">Análise baseada em dados de {result.sources.join(", ")} — período {dateLabel(result.period.start, result.period.timezone)} a {dateLabel(new Date(new Date(result.period.end).getTime() - 1), result.period.timezone)}. Gerada em {dateLabel(result.generatedAt, result.period.timezone)}.</p>
        </div>
      ) : null}
      <p className="mt-7 text-xs leading-5 text-neutral-500">As recomendações são geradas a partir dos dados disponíveis no sistema e devem apoiar, não substituir, decisões de gestão.</p>
    </>
  );
}
