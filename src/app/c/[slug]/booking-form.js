"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicBookingAction } from "./actions";

function nextDate(timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function isoToBrazilianDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function maskBrazilianDate(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function brazilianDateToIso(value) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

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

export function PublicBookingForm({ slug, procedimentos, profissionais, query, timeZone = "America/Bahia" }) {
  const firstProcedure = procedimentos[0]?.id || "";
  const initialDate = nextDate(timeZone);
  const [procedimentoIds, setProcedimentoIds] = useState(firstProcedure ? [firstProcedure] : []);
  const [profissionalId, setProfissionalId] = useState("");
  const [proceduresOpen, setProceduresOpen] = useState(false);
  const [procedureSearch, setProcedureSearch] = useState("");
  const [date, setDate] = useState(initialDate);
  const [dateText, setDateText] = useState(isoToBrazilianDate(initialDate));
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

  useEffect(() => {
    let cancelled = false;

    async function loadSlots() {
      if (!slug || !procedimentoIds.length || !date) {
        setSlots([]);
        setSelectedSlot("");
        setSelectedSlotProfessional("");
        if (dateText.length === 10) setSlotsMessage("Informe uma data válida no formato DD/MM/AAAA.");
        return;
      }
      setLoadingSlots(true);
      setSlotsMessage("");

      const params = new URLSearchParams({
        slug,
        date,
      });
      procedimentoIds.forEach((id) => params.append("procedimento_ids", id));
      if (profissionalId) params.set("profissional_id", profissionalId);

      try {
        const response = await fetch(`/api/public/availability?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;
        const nextSlots = Array.isArray(payload.slots) ? payload.slots : [];
        setSlots(nextSlots);
        setSelectedSlot(nextSlots[0]?.value || "");
        setSelectedSlotProfessional(nextSlots[0]?.profissional_id || "");
        setSlotsMessage(payload.message || (nextSlots.length ? "" : "Nenhum horário disponível para esta data."));
      } catch {
        if (!cancelled) {
          setSlots([]);
          setSelectedSlot("");
          setSelectedSlotProfessional("");
          setSlotsMessage("Não foi possível carregar os horários. Tente novamente.");
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    }

    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [date, dateText.length, procedimentoIds, profissionalId, slug]);

  function toggleProcedure(id) {
    setProcedimentoIds((current) => {
      if (current.includes(id)) {
        return current.length > 1 ? current.filter((item) => item !== id) : current;
      }
      return [...current, id];
    });
  }

  function handleSlotChange(value) {
    const slot = slots.find((item) => item.value === value);
    setSelectedSlot(value);
    setSelectedSlotProfessional(slot?.profissional_id || profissionalId || "");
  }

  function handleDateChange(value) {
    const masked = maskBrazilianDate(value);
    setDateText(masked);
    setDate(brazilianDateToIso(masked));
  }

  return (
    <form action={createPublicBookingAction} className="rounded-[1.75rem] border border-white/70 bg-[#15120f] p-7 text-white shadow-[0_32px_90px_rgba(20,18,15,0.26)]">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="data_hora" value={selectedSlot} />
      <input type="hidden" name="data_agenda" value={date} />
      <input type="hidden" name="profissional_disponivel_id" value={selectedSlotProfessional} />

      {query?.erro ? <div className="mb-5 rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{query.mensagem || "Não foi possível concluir o agendamento."}</div> : null}
      {query?.ok ? <div className="mb-5 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{query.mensagem || "Agendamento solicitado com sucesso."}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="relative block md:col-span-2">
          <span className="text-sm font-semibold text-white/75">Procedimentos</span>
          {procedimentoIds.map((id) => <input key={id} type="hidden" name="procedimento_ids" value={id} />)}
          <button type="button" onClick={() => setProceduresOpen((open) => !open)} className="mt-2 flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm text-white outline-none transition hover:border-white/25">
            <span>
              <strong className="block">{selectedProcedures.length ? `${selectedProcedures.length} procedimento(s) selecionado(s)` : "Selecionar procedimentos"}</strong>
              <span className="mt-1 block text-xs text-white/55">{totals.duration || 0} min - Total {money(totals.price)} - Sinal {money(totals.deposit)}</span>
            </span>
            <span className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">{proceduresOpen ? "Fechar" : "Alterar"}</span>
          </button>

          {selectedProcedures.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedProcedures.map((item) => (
                <button key={item.id} type="button" onClick={() => toggleProcedure(item.id)} className="rounded-full border border-[var(--clinic-accent)]/30 bg-[var(--clinic-accent)]/15 px-3 py-1 text-xs font-bold text-white transition hover:bg-[var(--clinic-accent)]/25">
                  {item.nome} x
                </button>
              ))}
            </div>
          ) : null}

          {proceduresOpen ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-3 overflow-hidden rounded-[1.5rem] border border-white/12 bg-[#211b18]/95 p-3 shadow-[0_28px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <input value={procedureSearch} onChange={(event) => setProcedureSearch(event.target.value)} placeholder="Buscar procedimento" className="h-11 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none placeholder:text-white/35" />
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {filteredProcedures.map((item) => {
                  const checked = procedimentoIds.includes(item.id);
                  return (
                    <button key={item.id} type="button" onClick={() => toggleProcedure(item.id)} className={["flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition", checked ? "border-[var(--clinic-accent)] bg-[var(--clinic-accent)]/18 text-white" : "border-white/10 bg-white/8 text-white/75 hover:border-white/25 hover:bg-white/12"].join(" ")}>
                      <span>
                        <strong className="block text-white">{item.nome}</strong>
                        <span className="mt-1 block text-xs text-white/55">{money(item.preco_promocional ?? item.preco)} - {item.duracao_minutos || 60} min - {serviceLabel(item)}</span>
                      </span>
                      <span className={["mt-1 h-5 w-5 shrink-0 rounded-full border", checked ? "border-[var(--clinic-accent)] bg-[var(--clinic-accent)]" : "border-white/25"].join(" ")} />
                    </button>
                  );
                })}
                {!filteredProcedures.length ? <p className="px-3 py-4 text-sm text-white/50">Nenhum procedimento encontrado.</p> : null}
              </div>
            </div>
          ) : null}
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-white/75">Profissional</span>
          <select name="profissional_id" value={profissionalId} onChange={(event) => setProfissionalId(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none">
            <option value="" className="text-neutral-950">Primeiro disponível</option>
            {profissionais.map((item) => <option key={item.id} value={item.id} className="text-neutral-950">{item.nome}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-white/75">Data</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="DD/MM/AAAA"
            value={dateText}
            onChange={(event) => handleDateChange(event.target.value)}
            pattern="\d{2}/\d{2}/\d{4}"
            maxLength={10}
            required
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none placeholder:text-white/35"
          />
        </label>

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
          {slotsMessage ? <span className="mt-2 block text-xs text-amber-100/80">{slotsMessage}</span> : null}
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
          <input name="email" type="email" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-white/75">CPF</span>
          <input name="cpf" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none" />
        </label>
      </div>
      <label className="mt-5 flex items-start gap-3 text-sm text-white/70">
        <input type="checkbox" name="consentimento_lgpd" required className="mt-1" />
        Aceito que meus dados sejam usados para contato, agendamento e atendimento, conforme política de privacidade da clínica.
      </label>
      <button type="submit" disabled={!selectedSlot || loadingSlots} className="mt-6 w-full rounded-full bg-[var(--clinic-accent)] px-6 py-4 text-sm font-bold text-[#15120f] shadow-[0_18px_44px_color-mix(in_srgb,var(--clinic-accent)_26%,transparent)] disabled:cursor-not-allowed disabled:opacity-60">
        Confirmar e seguir para pagamento
      </button>
    </form>
  );
}
