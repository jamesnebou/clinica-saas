"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { createPublicBookingAction } from "./actions";
import { AttributionFields } from "@/components/public-site/attribution-fields";
import {
  addDaysToDateKey,
  buildCalendarMonth,
  clinicDateKey,
  formatBrazilianDate,
  formatBrazilianNumericDate,
  formatCalendarMonth,
  monthKeyFromDateKey,
  shiftMonthKey,
} from "@/lib/public-booking/calendar-core.mjs";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function serviceLabel(procedimento) {
  const signal = depositValue(procedimento);
  if (signal <= 0) return "sem sinal online";
  return `sinal de ${money(signal)}`;
}

function depositValue(procedimento) {
  const price = Number(procedimento?.preco_promocional ?? procedimento?.preco ?? 0);
  const fixed = Number(procedimento?.sinal_valor || 0);
  const percent = Number(procedimento?.sinal_percentual || 0);
  const signal = fixed > 0 ? fixed : percent > 0 ? price * (percent / 100) : 0;
  return Math.max(0, Math.min(price, Number(signal.toFixed(2))));
}

export function PublicBookingForm({ slug, procedimentos, profissionais, query, timeZone = "America/Bahia", terminology = {} }) {
  const serviceSingular = terminology.procedimento || "Procedimento";
  const servicePlural = terminology.procedimentos || "Procedimentos";
  const professionalSingular = terminology.profissional || "Profissional";
  const today = clinicDateKey(timeZone);
  const initialDate = addDaysToDateKey(today, 1);
  const [procedimentoIds, setProcedimentoIds] = useState([]);
  const [profissionalId, setProfissionalId] = useState("");
  const [proceduresOpen, setProceduresOpen] = useState(false);
  const [procedureSearch, setProcedureSearch] = useState("");
  const [date, setDate] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(monthKeyFromDateKey(initialDate));
  const [availableDates, setAvailableDates] = useState([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [datesMessage, setDatesMessage] = useState("");
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [selectedSlotProfessional, setSelectedSlotProfessional] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsMessage, setSlotsMessage] = useState("");

  const selectedProcedures = useMemo(() => procedimentos.filter((item) => procedimentoIds.includes(item.id)), [procedimentos, procedimentoIds]);
  const filteredProcedures = useMemo(() => {
    const search = procedureSearch.trim().toLowerCase();
    if (!search) return procedimentos;
    return procedimentos.filter((item) => [item.nome, item.categoria, item.descricao].filter(Boolean).join(" ").toLowerCase().includes(search));
  }, [procedimentos, procedureSearch]);
  const totals = useMemo(() => selectedProcedures.reduce((acc, item) => ({
    duration: acc.duration + Number(item.duracao_minutos || 60) + Number(item.intervalo_minutos || 0),
    price: acc.price + Number(item.preco_promocional ?? item.preco ?? 0),
    deposit: acc.deposit + depositValue(item),
  }), { duration: 0, price: 0, deposit: 0 }), [selectedProcedures]);
  const calendarDays = useMemo(() => buildCalendarMonth(visibleMonth), [visibleMonth]);
  const availableDateSet = useMemo(() => new Set(availableDates), [availableDates]);
  const firstBookableMonth = monthKeyFromDateKey(initialDate);

  useEffect(() => {
    if (!proceduresOpen && !calendarOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setProceduresOpen(false);
        setCalendarOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [calendarOpen, proceduresOpen]);

  useEffect(() => {
    if (!calendarOpen || !slug || !procedimentoIds.length || !visibleMonth) return undefined;
    const controller = new AbortController();

    async function loadAvailableDates() {
      setLoadingDates(true);
      setDatesMessage("");
      const params = new URLSearchParams({ slug, month: visibleMonth });
      procedimentoIds.forEach((id) => params.append("procedimento_ids", id));
      if (profissionalId) params.set("profissional_id", profissionalId);

      try {
        const response = await fetch(`/api/public/availability?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || "Não foi possível consultar os dias disponíveis.");
        const nextDates = Array.isArray(payload.available_dates) ? payload.available_dates : [];
        setAvailableDates(nextDates);
        setDatesMessage(nextDates.length ? "" : "Nenhuma data disponível neste mês.");
      } catch (error) {
        if (error?.name === "AbortError") return;
        setAvailableDates([]);
        setDatesMessage(error?.message || "Não foi possível carregar o calendário. Tente novamente.");
      } finally {
        if (!controller.signal.aborted) setLoadingDates(false);
      }
    }

    loadAvailableDates();
    return () => controller.abort();
  }, [calendarOpen, procedimentoIds, profissionalId, slug, visibleMonth]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSlots() {
      if (!slug || !procedimentoIds.length || !date) {
        setSlots([]);
        setSelectedSlot("");
        setSelectedSlotProfessional("");
        return;
      }
      setSlots([]);
      setSelectedSlot("");
      setSelectedSlotProfessional("");
      setLoadingSlots(true);
      setSlotsMessage("");

      const params = new URLSearchParams({
        slug,
        date,
      });
      procedimentoIds.forEach((id) => params.append("procedimento_ids", id));
      if (profissionalId) params.set("profissional_id", profissionalId);

      try {
        const response = await fetch(`/api/public/availability?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || "Não foi possível consultar a agenda.");
        const nextSlots = Array.isArray(payload.slots) ? payload.slots : [];
        setSlots(nextSlots);
        setSelectedSlot(nextSlots[0]?.value || "");
        setSelectedSlotProfessional(nextSlots[0]?.profissional_id || "");
        setSlotsMessage(payload.message || (nextSlots.length ? "" : "Nenhum horário disponível para esta data."));
      } catch (error) {
        if (error?.name === "AbortError") return;
        setSlots([]);
        setSelectedSlot("");
        setSelectedSlotProfessional("");
        setSlotsMessage(error?.message || "Não foi possível carregar os horários. Tente novamente.");
      } finally {
        if (!controller.signal.aborted) setLoadingSlots(false);
      }
    }

    loadSlots();
    return () => controller.abort();
  }, [date, procedimentoIds, profissionalId, slug]);

  function toggleProcedure(id) {
    setProcedimentoIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current, id];
    });
    setDate("");
    setSelectedSlot("");
    setSelectedSlotProfessional("");
  }

  function handleSlotChange(value) {
    const slot = slots.find((item) => item.value === value);
    setSelectedSlot(value);
    setSelectedSlotProfessional(slot?.profissional_id || profissionalId || "");
  }

  function selectDate(nextDate) {
    if (!nextDate || nextDate < initialDate || !availableDateSet.has(nextDate)) return;
    setDate(nextDate);
    setVisibleMonth(monthKeyFromDateKey(nextDate));
    setCalendarOpen(false);
  }

  return (
    <form action={createPublicBookingAction} className="rounded-[1.75rem] border border-white/70 bg-[#15120f] p-4 text-white shadow-[0_32px_90px_rgba(20,18,15,0.26)] sm:p-7">
      <input type="hidden" name="slug" value={slug} />
      <AttributionFields />
      <input type="hidden" name="data_hora" value={selectedSlot} />
      <input type="hidden" name="data_agenda" value={date} />
      <input type="hidden" name="profissional_disponivel_id" value={selectedSlotProfessional} />

      {query?.erro ? <div className="mb-5 rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{query.mensagem || "Não foi possível concluir o agendamento."}</div> : null}
      {query?.ok ? <div className="mb-5 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{query.mensagem || "Agendamento solicitado com sucesso."}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="block md:col-span-2">
          <span className="text-sm font-semibold text-white/75">{servicePlural}</span>
          {procedimentoIds.map((id) => <input key={id} type="hidden" name="procedimento_ids" value={id} />)}
          <button type="button" onClick={() => { setCalendarOpen(false); setProceduresOpen(true); }} className="mt-2 flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm text-white outline-none transition hover:border-white/25">
            <span>
              <strong className="block">{selectedProcedures.length ? `${selectedProcedures.length} ${selectedProcedures.length === 1 ? serviceSingular : servicePlural} selecionado${selectedProcedures.length === 1 ? "" : "s"}` : `Selecionar ${servicePlural.toLocaleLowerCase("pt-BR")}`}</strong>
              <span className="mt-1 block text-xs text-white/55">{totals.duration || 0} min - Total {money(totals.price)} - Sinal {money(totals.deposit)}</span>
            </span>
            <span className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">{selectedProcedures.length ? "Alterar" : "Escolher"}</span>
          </button>

          {selectedProcedures.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedProcedures.map((item) => (
                <button key={item.id} type="button" onClick={() => toggleProcedure(item.id)} title={`Remover ${item.nome}`} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--clinic-accent)]/30 bg-[var(--clinic-accent)]/15 px-3 py-1 text-xs font-bold text-white transition hover:bg-[var(--clinic-accent)]/25">
                  {item.nome} <X size={12} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-white/75">{professionalSingular}</span>
          <select name="profissional_id" value={profissionalId} onChange={(event) => { setProfissionalId(event.target.value); setDate(""); }} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none">
            <option value="" className="text-neutral-950">Primeiro disponível</option>
            {profissionais.map((item) => <option key={item.id} value={item.id} className="text-neutral-950">{item.nome}</option>)}
          </select>
        </label>

        <div className="md:col-span-2">
          <span className="text-sm font-semibold text-white/75">Escolher data:</span>
          <button
            type="button"
            disabled={!procedimentoIds.length}
            onClick={() => { setProceduresOpen(false); setCalendarOpen(true); }}
            className="mt-2 flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm text-white transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="flex min-w-0 items-center gap-3">
              <CalendarDays size={20} className="shrink-0 text-[var(--clinic-accent)]" aria-hidden="true" />
              <span>Data selecionada: <strong>{formatBrazilianNumericDate(date) || "dd/mm/aaaa"}</strong></span>
            </span>
            <span className="shrink-0 text-xs text-white/55">{date ? "Alterar" : "Escolher"}</span>
          </button>
          {!procedimentoIds.length ? <span className="mt-2 block text-xs text-white/45">Selecione ao menos um {serviceSingular.toLocaleLowerCase("pt-BR")} para consultar as datas.</span> : null}
        </div>

        <label className="block md:col-span-2">
          <span className="text-sm font-semibold text-white/75">Horários disponíveis</span>
          <select value={selectedSlot} onChange={(event) => handleSlotChange(event.target.value)} required disabled={loadingSlots || !slots.length} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-55">
            {loadingSlots ? <option className="text-neutral-950">Carregando horários...</option> : null}
            {!loadingSlots && !slots.length ? <option className="text-neutral-950">Sem horários disponíveis</option> : null}
            {!loadingSlots && slots.map((slot) => (
              <option key={`${slot.value}-${slot.profissional_id}`} value={slot.value} className="text-neutral-950">
                {slot.label}{profissionalId ? "" : ` - ${slot.profissional_nome}`}
              </option>
            ))}
          </select>
          {slotsMessage ? <span className="mt-2 block text-xs text-amber-100/80" role="status">{slotsMessage} {!slots.length && !loadingSlots ? "Escolha outro dia no calendário." : ""}</span> : null}
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-white/75">Nome</span>
          <input name="nome" required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-white/75">WhatsApp</span>
          <input name="telefone" required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-white/75">E-mail</span>
          <input name="email" type="email" required autoComplete="email" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-white/75">CPF</span>
          <input name="cpf" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none" />
        </label>
      </div>

      {proceduresOpen ? createPortal((
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="procedure-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProceduresOpen(false);
          }}
        >
          <div className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-white/15 bg-[#211b18] shadow-[0_28px_90px_rgba(0,0,0,0.55)] sm:max-w-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
              <div>
                <h3 id="procedure-dialog-title" className="text-lg font-bold">Escolher {servicePlural.toLocaleLowerCase("pt-BR")}</h3>
                <p className="mt-1 text-xs text-white/55">Selecione um ou mais itens.</p>
              </div>
              <button type="button" onClick={() => setProceduresOpen(false)} title="Fechar" aria-label="Fechar seleção" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/15">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              <label className="relative block">
                <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" aria-hidden="true" />
                <input value={procedureSearch} onChange={(event) => setProcedureSearch(event.target.value)} placeholder={`Buscar ${serviceSingular.toLocaleLowerCase("pt-BR")}`} autoFocus className="h-11 w-full rounded-xl border border-white/10 bg-white/10 pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-[var(--clinic-accent)]" />
              </label>
              <div className="mt-3 space-y-2">
                {filteredProcedures.map((item) => {
                  const checked = procedimentoIds.includes(item.id);
                  return (
                    <button key={item.id} type="button" aria-pressed={checked} onClick={() => toggleProcedure(item.id)} className={["flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition", checked ? "border-[var(--clinic-accent)] bg-[var(--clinic-accent)]/20 text-white" : "border-white/10 bg-white/[0.06] text-white/75 hover:border-white/25 hover:bg-white/10"].join(" ")}>
                      <span>
                        <strong className="block text-white">{item.nome}</strong>
                        <span className="mt-1 block text-xs leading-5 text-white/55">{money(item.preco_promocional ?? item.preco)} - {item.duracao_minutos || 60} min - {serviceLabel(item)}</span>
                      </span>
                      <span className={["mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border", checked ? "border-[var(--clinic-accent)] bg-[var(--clinic-accent)] text-[#15120f]" : "border-white/25"].join(" ")}>
                        {checked ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : null}
                      </span>
                    </button>
                  );
                })}
                {!filteredProcedures.length ? <p className="px-3 py-6 text-center text-sm text-white/50">Nenhum {serviceSingular.toLocaleLowerCase("pt-BR")} encontrado.</p> : null}
              </div>
            </div>

            <div className="border-t border-white/10 bg-[#1a1613] px-4 py-4 sm:px-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
                <span>{selectedProcedures.length} selecionado{selectedProcedures.length === 1 ? "" : "s"}</span>
                <span>{totals.duration} min · {money(totals.price)}</span>
              </div>
              <button type="button" disabled={!procedimentoIds.length} onClick={() => setProceduresOpen(false)} className="h-12 w-full rounded-full bg-[var(--clinic-accent)] px-5 text-sm font-bold text-[#15120f] transition disabled:cursor-not-allowed disabled:opacity-45">
                Concluir seleção
              </button>
            </div>
          </div>
        </div>
      ), document.body) : null}

      {calendarOpen ? createPortal((
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCalendarOpen(false);
          }}
        >
          <div className="w-full rounded-t-2xl border border-white/15 bg-[#211b18] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.55)] sm:max-w-lg sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="calendar-dialog-title" className="text-lg font-bold">Escolher data</h3>
                <p className="mt-1 text-xs text-white/55">Dias esmaecidos não possuem vaga para esta seleção.</p>
              </div>
              <button type="button" onClick={() => setCalendarOpen(false)} title="Fechar" aria-label="Fechar calendário" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/15">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button type="button" title="Mês anterior" aria-label="Exibir mês anterior" disabled={visibleMonth <= firstBookableMonth} onClick={() => setVisibleMonth((current) => shiftMonthKey(current, -1))} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30">
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <strong className="min-w-0 text-center text-sm sm:text-base">{formatCalendarMonth(visibleMonth)}</strong>
              <button type="button" title="Próximo mês" aria-label="Exibir próximo mês" onClick={() => setVisibleMonth((current) => shiftMonthKey(current, 1))} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/15">
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-0.5 text-center sm:gap-1" role="grid" aria-label={`Calendário de ${formatCalendarMonth(visibleMonth)}`}>
              {WEEKDAYS.map((weekday) => <span key={weekday} role="columnheader" className="py-1 text-[10px] font-bold uppercase text-white/45 sm:text-xs">{weekday}</span>)}
              {calendarDays.map((day) => {
                const past = day.date < initialDate;
                const unavailable = day.inMonth && !past && !loadingDates && !availableDateSet.has(day.date);
                const disabled = !day.inMonth || past || loadingDates || unavailable;
                const selected = day.date === date;
                const isToday = day.date === today;
                return (
                  <button
                    key={day.date}
                    type="button"
                    role="gridcell"
                    disabled={disabled}
                    title={unavailable ? "Sem vagas nesta data" : undefined}
                    aria-label={day.inMonth ? `${formatBrazilianDate(day.date)}${unavailable ? ", sem vagas" : ""}` : undefined}
                    aria-selected={selected}
                    onClick={() => selectDate(day.date)}
                    className={[
                      "relative grid min-h-10 place-items-center rounded-xl text-xs font-bold transition sm:min-h-12 sm:text-sm",
                      selected ? "bg-[var(--clinic-accent)] text-[#15120f]" : "text-white/80 hover:bg-white/12 hover:text-white",
                      !day.inMonth || past ? "opacity-15" : "",
                      unavailable ? "opacity-30" : "",
                      loadingDates && day.inMonth ? "animate-pulse opacity-30" : "",
                      isToday && !selected ? "ring-1 ring-inset ring-white/30" : "",
                    ].join(" ")}
                  >
                    {day.day}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 min-h-10 rounded-xl bg-white/[0.07] px-3 py-2.5 text-xs text-white/70" aria-live="polite">
              {loadingDates ? "Consultando disponibilidade..." : datesMessage || (date ? <>Data selecionada: <strong className="text-white">{formatBrazilianNumericDate(date)}</strong></> : "Selecione um dia disponível.")}
            </div>
          </div>
        </div>
      ), document.body) : null}

      <label className="mt-5 flex items-start gap-3 text-sm text-white/70">
        <input type="checkbox" name="consentimento_lgpd" required className="mt-1" />
        Aceito que meus dados sejam usados para contato, agendamento e atendimento, conforme política de privacidade da clínica.
      </label>
      <label className="mt-3 flex items-start gap-3 text-sm text-white/70">
        <input type="checkbox" name="whatsapp_transactional_opt_in" className="mt-1" />
        Quero receber pelo WhatsApp atualizações transacionais deste agendamento, como reserva, pagamento, lembretes e alterações. Posso cancelar quando quiser.
      </label>
      <button type="submit" disabled={!selectedSlot || loadingSlots} className="mt-6 w-full rounded-full bg-[var(--clinic-accent)] px-6 py-4 text-sm font-bold text-[#15120f] shadow-[0_18px_44px_color-mix(in_srgb,var(--clinic-accent)_26%,transparent)] disabled:cursor-not-allowed disabled:opacity-60">
        Confirmar e seguir para pagamento
      </button>
    </form>
  );
}
