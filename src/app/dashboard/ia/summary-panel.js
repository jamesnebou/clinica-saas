"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

function isCompleteSummary(payload) {
  const analysis = payload?.analysis;
  return typeof analysis?.title === "string"
    && typeof analysis.executiveSummary === "string"
    && ["highlights", "alerts", "opportunities", "recommendedActions"].every((field) => Array.isArray(analysis[field]))
    && Array.isArray(payload.sources)
    && typeof payload.period?.start === "string"
    && typeof payload.period.end === "string"
    && typeof payload.period.timezone === "string"
    && typeof payload.generatedAt === "string";
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

export function ClinicSummaryPanel({ scopeKey }) {
  const [days, setDays] = useState(30);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [renderScope, setRenderScope] = useState(scopeKey);
  const requestRef = useRef(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const scopeRef = useRef(scopeKey);

  if (renderScope !== scopeKey) {
    setRenderScope(scopeKey);
    setResult(null);
    setError("");
    setLoading(false);
  }

  const abortCurrent = useCallback(() => {
    generationRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  const invalidate = useCallback(() => {
    abortCurrent();
    setResult(null);
    setError("");
    setLoading(false);
  }, [abortCurrent]);

  useEffect(() => {
    mountedRef.current = true;
    scopeRef.current = scopeKey;
    abortCurrent();
    const onVisibilityChange = () => { if (document.hidden) invalidate(); };
    const onPageChange = () => invalidate();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageChange);
    window.addEventListener("pageshow", onPageChange);
    window.addEventListener("blur", onPageChange);
    return () => {
      mountedRef.current = false;
      abortCurrent();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageChange);
      window.removeEventListener("pageshow", onPageChange);
      window.removeEventListener("blur", onPageChange);
    };
  }, [abortCurrent, invalidate, scopeKey]);

  async function submit() {
    if (requestRef.current) return;
    const controller = new AbortController();
    const generation = ++generationRef.current;
    const requestScope = scopeKey;
    const isCurrent = () => mountedRef.current && generationRef.current === generation && scopeRef.current === requestScope;
    requestRef.current = controller;
    setResult(null);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/summary", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }), signal: controller.signal, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI_UNAVAILABLE");
      if (!isCompleteSummary(payload)) throw new Error("AI_UNAVAILABLE");
      if (isCurrent()) setResult({ scopeKey: requestScope, payload });
    } catch (cause) {
      if (isCurrent()) {
        setResult(null);
        setError(messages[cause?.message] || messages.AI_UNAVAILABLE);
      }
    } finally {
      if (isCurrent()) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  const visibleResult = result?.scopeKey === scopeKey ? result.payload : null;

  return (
    <>
      <section className="mt-7 border-b border-neutral-200 pb-6">
        <p className="text-sm text-neutral-600">Selecione o período para analisar os dados disponíveis.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Período" className="inline-flex overflow-hidden rounded-md border border-neutral-300">
            {[7, 30].map((value) => <button key={value} type="button" disabled={loading} aria-pressed={days === value} onClick={() => { invalidate(); setDays(value); }} className={`h-10 min-w-20 px-3 text-sm font-semibold disabled:opacity-60 ${days === value ? "bg-[var(--clinic-primary)] text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}>{value} dias</button>)}
          </div>
          <button type="button" onClick={submit} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-950 px-4 text-sm font-semibold text-white disabled:opacity-60">
            <Sparkles size={16} />{loading ? "Analisando..." : visibleResult ? "Atualizar análise" : "Gerar resumo inteligente"}
          </button>
        </div>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      </section>
      {visibleResult ? (
        <div aria-live="polite" className="mt-6">
          <h2 className="text-xl font-bold text-neutral-950">{visibleResult.analysis.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-700">{visibleResult.analysis.executiveSummary}</p>
          <div className="mt-6 grid gap-x-8 md:grid-cols-2">
            <ItemList title="Destaques" icon={Sparkles} items={visibleResult.analysis.highlights} />
            <ItemList title="Alertas" icon={AlertTriangle} items={visibleResult.analysis.alerts} />
            <ItemList title="Oportunidades" icon={Lightbulb} items={visibleResult.analysis.opportunities} />
            <ItemList title="Próximas ações" icon={ArrowUpRight} items={visibleResult.analysis.recommendedActions} kind="actions" />
          </div>
          <p className="mt-6 border-t border-neutral-200 pt-4 text-xs text-neutral-500">Análise baseada em dados de {visibleResult.sources.join(", ")} — período {dateLabel(visibleResult.period.start, visibleResult.period.timezone)} a {dateLabel(new Date(new Date(visibleResult.period.end).getTime() - 1), visibleResult.period.timezone)}. Gerada em {dateLabel(visibleResult.generatedAt, visibleResult.period.timezone)}.</p>
        </div>
      ) : null}
      <p className="mt-7 text-xs leading-5 text-neutral-500">As recomendações são geradas a partir dos dados disponíveis no sistema e devem apoiar, não substituir, decisões de gestão.</p>
    </>
  );
}
