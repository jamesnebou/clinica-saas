"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";

const suggestions = [
  "Analisar meu desempenho",
  "Entender meu financeiro",
  "Analisar meus agendamentos",
  "Verificar faltas e cancelamentos",
  "Entender o crescimento de clientes",
];
const errors = {
  AI_FORBIDDEN: "Sua sessão ou permissão mudou. Entre novamente para continuar.",
  AI_RATE_LIMITED: "O limite de análises foi atingido. Tente novamente mais tarde.",
  AI_NOT_CONFIGURED: "IA ainda não configurada neste ambiente.",
  AI_INVALID_REQUEST: "Revise a pergunta e tente novamente.",
  AI_UNAVAILABLE: "Não foi possível responder agora. Tente novamente mais tarde.",
};
const formatters = {
  count: new Intl.NumberFormat("pt-BR"),
  currency: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
  percent: new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }),
};

function Indicator({ metric }) {
  const formatted = formatters[metric.kind]?.format(metric.value) ?? "—";
  return <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-neutral-200 py-2 text-sm last:border-0">
    <dt className="text-neutral-600">{metric.label}</dt>
    <dd className="shrink-0 font-semibold tabular-nums text-neutral-900">{formatted}{metric.kind === "percent" ? "%" : ""}</dd>
  </div>;
}

function ChatMessage({ message }) {
  if (message.role === "user") return (
    <div className="flex justify-end">
      <div className="max-w-[88%] rounded-md bg-neutral-900 px-4 py-3 text-sm leading-6 text-white sm:max-w-[75%]">{message.text}</div>
    </div>
  );
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--clinic-primary)] text-white"><Bot size={17} /></div>
      <div className="min-w-0 max-w-3xl flex-1 text-sm leading-6 text-neutral-800">
        {message.local ? <p className="pt-1">{message.text}</p> : <>
          <p className="font-semibold text-neutral-950">Indicadores confirmados</p>
          {message.confirmed.length ? <dl className="mt-2 max-w-xl">{message.confirmed.map((metric) => <Indicator key={metric.label} metric={metric} />)}</dl>
            : <p className="mt-2 text-neutral-600">Não há base comparável para este indicador no período.</p>}
          <p className="mt-5 font-semibold text-neutral-950">Leitura gerencial</p>
          <p className="mt-1 whitespace-pre-wrap">{message.interpretation}</p>
          {message.nextSteps.length ? <>
            <p className="mt-5 font-semibold text-neutral-950">Próximos passos</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">{message.nextSteps.map((step, index) => <li key={index}>{step}</li>)}</ul>
          </> : null}
        </>}
      </div>
    </div>
  );
}

export function ClinicChatPanel({ scopeKey }) {
  const [days, setDays] = useState(30);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [renderScope, setRenderScope] = useState(scopeKey);
  const requestRef = useRef(null);
  const generationRef = useRef(0);
  const messageIdRef = useRef(0);
  const lastIntentRef = useRef(null);
  const mountedRef = useRef(false);
  const scopeRef = useRef(scopeKey);
  const endRef = useRef(null);

  if (renderScope !== scopeKey) {
    setRenderScope(scopeKey);
    setMessages([]);
    setDraft("");
    setError("");
    setLoading(false);
  }

  const abortCurrent = useCallback(() => {
    generationRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    lastIntentRef.current = null;
  }, []);

  const clearConversation = useCallback(() => {
    abortCurrent();
    setMessages([]);
    setDraft("");
    setError("");
    setLoading(false);
  }, [abortCurrent]);

  useEffect(() => {
    mountedRef.current = true;
    scopeRef.current = scopeKey;
    abortCurrent();
    const onVisibilityChange = () => { if (document.hidden) clearConversation(); };
    const onPageChange = () => clearConversation();
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
  }, [abortCurrent, clearConversation, scopeKey]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [messages, loading]);

  async function submit(suggestion) {
    if (requestRef.current) return;
    const question = (typeof suggestion === "string" ? suggestion : draft).trim();
    if (question.length < 2 || question.length > 400) {
      setError("Escreva uma pergunta de até 400 caracteres.");
      return;
    }
    const controller = new AbortController();
    const generation = ++generationRef.current;
    const requestScope = scopeKey;
    const isCurrent = () => mountedRef.current && generationRef.current === generation && scopeRef.current === requestScope;
    requestRef.current = controller;
    const lastIntent = lastIntentRef.current;
    setMessages((current) => [...current.slice(-10), { id: ++messageIdRef.current, role: "user", text: question }]);
    setDraft("");
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, days, lastIntent }), signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "AI_UNAVAILABLE");
      if (payload?.type !== "local" && payload?.type !== "analysis") throw new Error("AI_UNAVAILABLE");
      if (payload.type === "analysis" && (!Array.isArray(payload.confirmed) || !Array.isArray(payload.nextSteps) || typeof payload.interpretation !== "string")) throw new Error("AI_UNAVAILABLE");
      if (payload.type === "local" && typeof payload.message !== "string") throw new Error("AI_UNAVAILABLE");
      if (isCurrent()) {
        lastIntentRef.current = payload.lastIntent || null;
        setMessages((current) => [...current.slice(-11), { id: ++messageIdRef.current, role: "assistant",
          ...(payload.type === "local" ? { local: true, text: payload.message }
            : { local: false, confirmed: payload.confirmed, interpretation: payload.interpretation, nextSteps: payload.nextSteps }) }]);
      }
    } catch (cause) {
      if (isCurrent()) {
        clearConversation();
        setError(errors[cause?.message] || errors.AI_UNAVAILABLE);
      }
    } finally {
      if (isCurrent()) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  const visibleMessages = renderScope === scopeKey ? messages : [];
  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4">
        <div className="flex items-center gap-3">
          <Sparkles size={18} className="text-[var(--clinic-primary)]" />
          <span className="text-sm font-semibold text-neutral-900">Conversa de gestão</span>
          <span className="text-xs text-neutral-500">Últimos {days} dias</span>
        </div>
        <button type="button" onClick={clearConversation} className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-300 px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">
          <RotateCcw size={15} /> Nova conversa
        </button>
      </div>

      <div role="log" aria-label="Conversa com NexaWi IA" aria-live="polite" className="max-h-[52vh] min-h-[280px] space-y-6 overflow-y-auto py-6 pr-1 sm:min-h-[360px]">
        {visibleMessages.length === 0 ? <div className="max-w-2xl py-4">
          <h2 className="text-lg font-bold text-neutral-950">Como posso ajudar na gestão hoje?</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">Converse sobre agenda, financeiro, clientes e tendências com base nos indicadores disponíveis.</p>
          <div className="mt-6 flex flex-wrap gap-2">{suggestions.map((suggestion) => <button key={suggestion} type="button" disabled={loading} onClick={() => submit(suggestion)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-left text-xs font-medium text-neutral-700 hover:border-[var(--clinic-primary)] hover:text-neutral-950 disabled:opacity-60">{suggestion}</button>)}</div>
        </div> : visibleMessages.map((message) => <ChatMessage key={message.id} message={message} />)}
        {loading ? <div className="flex items-center gap-2 text-sm text-neutral-500"><LoaderCircle size={17} className="animate-spin" /> Analisando indicadores...</div> : null}
        <div ref={endRef} />
      </div>

      {error ? <p role="alert" className="mb-3 text-sm text-red-700">{error}</p> : null}
      <div className="border-t border-neutral-200 pt-4">
        <div role="group" aria-label="Período da conversa" className="mb-3 inline-flex overflow-hidden rounded-md border border-neutral-300">
          {[7, 30].map((value) => <button key={value} type="button" disabled={loading} aria-pressed={days === value}
            onClick={() => { if (value !== days) { clearConversation(); setDays(value); } }}
            className={`h-9 min-w-18 px-3 text-xs font-semibold disabled:opacity-60 ${days === value ? "bg-[var(--clinic-primary)] text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}>{value} dias</button>)}
        </div>
        <div className="flex items-end gap-2 rounded-md border border-neutral-300 bg-white p-2 focus-within:border-[var(--clinic-primary)]">
          <textarea aria-label="Pergunta para NexaWi IA" placeholder="Pergunte sobre os resultados da sua clínica..." value={draft} maxLength={400} disabled={loading}
            onChange={(event) => setDraft(event.target.value.slice(0, 400))}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }}
            rows={2} className="min-h-16 min-w-0 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 disabled:opacity-60" />
          <button type="button" aria-label="Enviar pergunta" title="Enviar pergunta" onClick={() => submit()} disabled={loading || !draft.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-neutral-950 text-white disabled:opacity-40"><ArrowUp size={19} /></button>
        </div>
        <div className="mt-2 flex justify-end text-xs tabular-nums text-neutral-500">{draft.length}/400</div>
      </div>
    </section>
  );
}
