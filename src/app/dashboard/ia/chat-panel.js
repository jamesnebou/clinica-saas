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
const agendaStatuses = { agendado: "Agendado", confirmado: "Confirmado", em_atendimento: "Em atendimento",
  concluido: "Concluído", cancelado: "Cancelado", faltou: "Faltou" };

function AgendaAnswer({ message, onMore }) {
  return <div className="space-y-5">
    {message.days.map((day) => {
      const items = message.appointments.filter((item) => item.date === day.date);
      return <section key={day.date} className="border-b border-neutral-200 pb-4 last:border-0">
        <h3 className="font-semibold text-neutral-950">{day.label} <span className="ml-2 text-xs font-normal text-neutral-500">{day.total} agendamento{day.total === 1 ? "" : "s"}</span></h3>
        {message.mode === "count" && day.total ? null : items.length ? <ul className="mt-2 space-y-2">{items.map((item, index) => <li key={`${item.date}-${item.time}-${index}`} className="grid gap-1 rounded-md border border-neutral-200 bg-white px-3 py-2 sm:grid-cols-[4rem_1fr_auto] sm:gap-3">
          <time className="font-semibold tabular-nums">{item.time}</time>
          <span className="min-w-0"><span className="block font-medium">{item.client || item.procedures.join(", ")}</span>
            {item.client ? <span className="block text-neutral-600">{item.procedures.join(", ") || "Procedimento indisponível"}</span> : null}
            {item.professional ? <span className="block text-xs text-neutral-500">{item.professional}</span> : null}</span>
          <span className="text-xs font-medium text-neutral-600">{agendaStatuses[item.status] || item.status}</span>
        </li>)}</ul> : <p className="mt-2 text-neutral-600">{day.total ? message.mode === "first" ? "O primeiro horário do período está exibido acima." : "Agendamentos desta data podem estar em outra página." : "Não encontrei agendamentos para essa data."}</p>}
      </section>;
    })}
    {message.hasMore && onMore ? <button type="button" onClick={onMore} className="text-sm font-semibold text-[var(--clinic-primary)] hover:underline">Mostrar mais agendamentos</button> : null}
    {message.limitReached ? <p className="text-sm text-amber-800">Há mais resultados. Refine o período para consultar os demais.</p> : null}
  </div>;
}

function Indicator({ metric }) {
  const formatted = formatters[metric.kind]?.format(metric.value) ?? "—";
  return <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-neutral-200 py-2 text-sm last:border-0">
    <dt className="text-neutral-600">{metric.label}</dt>
    <dd className="shrink-0 font-semibold tabular-nums text-neutral-900">{formatted}{metric.kind === "percent" ? "%" : ""}</dd>
  </div>;
}

function AnalysisSection({ title, items }) {
  if (!items?.length) return null;
  return <section className="mt-5"><h3 className="font-semibold text-neutral-950">{title}</h3>
    <ul className="mt-1 list-disc space-y-1 pl-5">{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section>;
}

function ChatMessage({ message, onMore }) {
  if (message.role === "user") return (
    <div className="flex justify-end">
      <div className="max-w-[88%] rounded-md bg-neutral-900 px-4 py-3 text-sm leading-6 text-white sm:max-w-[75%]">{message.text}</div>
    </div>
  );
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--clinic-primary)] text-white"><Bot size={17} /></div>
      <div className="min-w-0 max-w-3xl flex-1 text-sm leading-6 text-neutral-800">
        {message.agenda ? <AgendaAnswer message={message} onMore={onMore} /> : message.local ? <p className="pt-1">{message.text}</p> : <>
          <p className="font-semibold text-neutral-950">Indicadores confirmados</p>
          {message.confirmed.length ? <dl className="mt-2 max-w-xl">{message.confirmed.map((metric) => <Indicator key={metric.label} metric={metric} />)}</dl>
            : <p className="mt-2 text-neutral-600">Não há base comparável para este indicador no período.</p>}
          {message.analysis ? <><p className="mt-5 font-semibold text-neutral-950">Resumo executivo</p>
            <p className="mt-1 whitespace-pre-wrap">{message.analysis.executiveSummary}</p>
            <AnalysisSection title="Pontos positivos" items={message.analysis.positives} />
            <AnalysisSection title="Pontos de atenção" items={message.analysis.attention} />
            <AnalysisSection title="Oportunidades" items={message.analysis.opportunities} />
            <AnalysisSection title="Indicadores a acompanhar" items={message.analysis.watch} />
          </> : null}
          {message.interpretation ? <><p className="mt-5 font-semibold text-neutral-950">Interpretação</p>
            <p className="mt-1 whitespace-pre-wrap">{message.interpretation}</p></> : null}
          {message.notice ? <p className="mt-3 text-amber-800">{message.notice}</p> : null}
          {message.nextSteps.length ? <>
            <p className="mt-5 font-semibold text-neutral-950">Próximos passos</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">{message.nextSteps.map((step, index) => <li key={index}>{step}</li>)}</ul>
          </> : null}
          <AnalysisSection title="Para aprofundar" items={message.analysis?.followUps} />
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
  const agendaContextRef = useRef(null);
  const memoryRef = useRef(null);
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
    agendaContextRef.current = null;
    memoryRef.current = null;
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

  async function submit(suggestion, agendaPage = 0) {
    if (requestRef.current) return;
    const question = (agendaPage ? "Me mostre mais desses agendamentos" : typeof suggestion === "string" ? suggestion : draft).trim();
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
    if (!agendaPage) setMessages((current) => [...current.slice(-10), { id: ++messageIdRef.current, role: "user", text: question }]);
    setDraft("");
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, days, lastIntent, memory: memoryRef.current,
          agendaContext: agendaContextRef.current, agendaPage }), signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) {
        const failure = new Error(payload?.error || "AI_UNAVAILABLE");
        failure.status = response.status;
        throw failure;
      }
      if (!["local", "analysis", "agenda_details"].includes(payload?.type)) throw new Error("AI_UNAVAILABLE");
      if (payload.type === "analysis" && (!Array.isArray(payload.confirmed) || !Array.isArray(payload.nextSteps) || typeof payload.interpretation !== "string")) throw new Error("AI_UNAVAILABLE");
      if (payload.type === "local" && typeof payload.message !== "string") throw new Error("AI_UNAVAILABLE");
      if (payload.type === "agenda_details" && (!Array.isArray(payload.days) || !Array.isArray(payload.appointments) || !payload.agendaContext)) throw new Error("AI_UNAVAILABLE");
      if (isCurrent()) {
        lastIntentRef.current = payload.lastIntent || null;
        agendaContextRef.current = payload.type === "agenda_details" ? payload.agendaContext : null;
        if (payload.type !== "local" || payload.memory) memoryRef.current = payload.memory || null;
        if (agendaPage) setMessages((current) => current.map((item, index) => index === current.length - 1 && item.agenda
          ? { ...item, appointments: [...item.appointments, ...payload.appointments], hasMore: payload.hasMore, page: payload.page } : item));
        else setMessages((current) => [...current.slice(-11), { id: ++messageIdRef.current, role: "assistant",
          ...(payload.type === "local" ? { local: true, text: payload.message }
            : payload.type === "agenda_details" ? { agenda: true, ...payload }
              : { local: false, confirmed: payload.confirmed, interpretation: payload.interpretation, nextSteps: payload.nextSteps,
                analysis: payload.analysis || null, notice: payload.notice || null }) }]);
      }
    } catch (cause) {
      if (isCurrent()) {
        if (cause?.status === 401 || cause?.status === 403 || cause?.message === "AI_FORBIDDEN") clearConversation();
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
        </div> : visibleMessages.map((message, index) => <ChatMessage key={message.id} message={message}
          onMore={index === visibleMessages.length - 1 ? () => submit(null, message.page + 1) : undefined} />)}
        {loading ? <div className="flex items-center gap-2 text-sm text-neutral-500"><LoaderCircle size={17} className="animate-spin" /> Consultando dados...</div> : null}
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
