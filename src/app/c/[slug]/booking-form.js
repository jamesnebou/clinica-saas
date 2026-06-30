"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicBookingAction } from "./actions";

function nextDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function serviceLabel(procedimento) {
  const price = Number(procedimento?.preco || 0);
  const fixed = Number(procedimento?.sinal_valor || 0);
  const percent = Number(procedimento?.sinal_percentual || 0);
  const signal = fixed > 0 ? fixed : percent > 0 ? price * (percent / 100) : 0;
  if (signal <= 0) return "sem sinal online";
  return `sinal de ${money(signal)}`;
}

export function PublicBookingForm({ slug, procedimentos, profissionais, query }) {
  const firstProcedure = procedimentos[0]?.id || "";
  const [procedimentoId, setProcedimentoId] = useState(firstProcedure);
  const [profissionalId, setProfissionalId] = useState("");
  const [date, setDate] = useState(nextDate());
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [selectedSlotProfessional, setSelectedSlotProfessional] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsMessage, setSlotsMessage] = useState("");

  const selectedProcedure = useMemo(() => procedimentos.find((item) => item.id === procedimentoId), [procedimentos, procedimentoId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSlots() {
      if (!slug || !procedimentoId || !date) return;
      setLoadingSlots(true);
      setSlotsMessage("");

      const params = new URLSearchParams({
        slug,
        procedimento_id: procedimentoId,
        date,
      });
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
  }, [date, procedimentoId, profissionalId, slug]);

  function handleSlotChange(value) {
    const slot = slots.find((item) => item.value === value);
    setSelectedSlot(value);
    setSelectedSlotProfessional(slot?.profissional_id || profissionalId || "");
  }

  return (
    <form action={createPublicBookingAction} className="rounded-[1.75rem] border border-white/70 bg-[#15120f] p-7 text-white shadow-[0_32px_90px_rgba(20,18,15,0.26)]">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="data_hora" value={selectedSlot} />
      <input type="hidden" name="profissional_disponivel_id" value={selectedSlotProfessional} />

      {query?.erro ? <div className="mb-5 rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{query.mensagem || "Não foi possível concluir o agendamento."}</div> : null}
      {query?.ok ? <div className="mb-5 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{query.mensagem || "Agendamento solicitado com sucesso."}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="text-sm font-semibold text-white/75">Procedimento</span>
          <select name="procedimento_id" value={procedimentoId} onChange={(event) => setProcedimentoId(event.target.value)} required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none">
            {procedimentos.map((item) => <option key={item.id} value={item.id} className="text-neutral-950">{item.nome} - {money(item.preco)} - {serviceLabel(item)}</option>)}
          </select>
          {selectedProcedure ? <span className="mt-2 block text-xs text-white/45">{selectedProcedure.duracao_minutos} minutos de atendimento.</span> : null}
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-white/75">Profissional</span>
          <select name="profissional_id" value={profissionalId} onChange={(event) => setProfissionalId(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none">
            <option value="" className="text-neutral-950">Primeiro disponível</option>
            {profissionais.map((item) => <option key={item.id} value={item.id} className="text-neutral-950">{item.nome}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-white/75">Data</span>
          <input name="data_agenda" type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(event) => setDate(event.target.value)} required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none" />
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
