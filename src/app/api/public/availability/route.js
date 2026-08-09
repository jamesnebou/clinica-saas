import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  clinicTimeZone,
  dateFromClinicLocal,
  dateKeyInTimeZone,
  getWorkingPeriods,
  inactiveDateFor,
  localTimeFromDate,
  utcRangeForClinicDate,
  weekdayFromDateKey,
} from "@/lib/clinic/schedule";
import { intervalsOverlap, totalAppointmentMinutes } from "@/lib/domain/schedule-core.mjs";

function pad(value) {
  return String(value).padStart(2, "0");
}

function localDateTime(date, minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${date}T${pad(hours)}:${pad(mins)}`;
}

function overlaps(startMinutes, endMinutes, booking, date, timeZone) {
  const start = new Date(booking.inicio);
  const end = new Date(booking.fim);
  if (dateKeyInTimeZone(start, timeZone) !== date) return false;
  const bookingStart = localTimeFromDate(start, timeZone);
  const bookingEnd = dateKeyInTimeZone(end, timeZone) === date
    ? localTimeFromDate(end, timeZone)
    : 24 * 60;
  return intervalsOverlap(startMinutes, endMinutes, bookingStart, bookingEnd);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const slug = String(searchParams.get("slug") || "").trim();
  const procedimentoIds = Array.from(new Set([
    ...searchParams.getAll("procedimento_ids"),
    String(searchParams.get("procedimento_id") || ""),
  ].map((item) => String(item || "").trim()).filter(Boolean)));
  const profissionalId = String(searchParams.get("profissional_id") || "").trim();
  const date = String(searchParams.get("date") || "").trim();

  if (!slug || !procedimentoIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ slots: [], message: "Parametros invalidos." }, { status: 400 });
  }

  const { data: clinic, error: clinicError } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, status, metadata")
    .eq("slug", slug)
    .in("status", ["trial", "ativa"])
    .maybeSingle();

  if (clinicError) throw clinicError;
  if (!clinic || clinic.metadata?.site_publico?.publicado === false) {
    return NextResponse.json({ slots: [], message: "Clínica indisponível." }, { status: 404 });
  }

  const { data: procedimentos = [], error: procedimentoError } = await supabaseAdmin
    .from("procedimentos")
    .select("id, duracao_minutos, intervalo_minutos")
    .eq("clinica_id", clinic.id)
    .in("id", procedimentoIds)
    .eq("ativo", true)
    .eq("publicado_site", true);

  if (procedimentoError) throw procedimentoError;
  if (procedimentos.length !== procedimentoIds.length) return NextResponse.json({ slots: [], message: "Um ou mais procedimentos estao indisponiveis." }, { status: 404 });

  let profissionaisQuery = supabaseAdmin
    .from("profissionais")
    .select("id, nome")
    .eq("clinica_id", clinic.id)
    .eq("ativo", true)
    .order("nome");

  if (profissionalId) profissionaisQuery = profissionaisQuery.eq("id", profissionalId);

  const { data: profissionais = [], error: profissionaisError } = await profissionaisQuery;
  if (profissionaisError) throw profissionaisError;
  if (!profissionais.length) return NextResponse.json({ slots: [], message: "Nenhum profissional disponivel." });

  const schedule = clinic.metadata?.horario_funcionamento || {};
  const timeZone = clinicTimeZone(clinic);
  const inactiveDate = inactiveDateFor(schedule, date, timeZone);
  if (inactiveDate) {
    return NextResponse.json({ slots: [], message: inactiveDate.motivo || "Clínica sem atendimento nesta data." });
  }

  const day = weekdayFromDateKey(date);
  const periods = getWorkingPeriods(schedule, day);

  if (!periods.length) {
    return NextResponse.json({ slots: [], message: "A clínica não atende nesta data." });
  }

  const duration = totalAppointmentMinutes(procedimentos, { defaultDuration: 60, includeIntervals: true });

  if (!periods.some((period) => period.end >= period.start + duration)) {
    return NextResponse.json({ slots: [], message: "Expediente insuficiente para os procedimentos selecionados." });
  }

  const dateRange = utcRangeForClinicDate(date, timeZone);
  if (!dateRange) {
    return NextResponse.json({ slots: [], message: "Data inválida." }, { status: 400 });
  }

  const { data: bookings = [], error: bookingsError } = await supabaseAdmin
    .from("agendamentos")
    .select("id, profissional_id, inicio, fim, status")
    .eq("clinica_id", clinic.id)
    .in("profissional_id", profissionais.map((item) => item.id))
    .not("status", "eq", "cancelado")
    .gte("inicio", dateRange.start.toISOString())
    .lt("inicio", dateRange.end.toISOString());

  if (bookingsError) throw bookingsError;

  const now = new Date();
  const slots = [];

  for (const period of periods) {
    for (let minutes = period.start; minutes + duration <= period.end; minutes += 30) {
      const value = localDateTime(date, minutes);
      const slotDate = dateFromClinicLocal(value, timeZone);
      if (!slotDate) continue;
      if (slotDate <= now) continue;

      const availableProfessional = profissionais.find((professional) => {
        const professionalBookings = bookings.filter((booking) => booking.profissional_id === professional.id);
        return !professionalBookings.some((booking) => overlaps(minutes, minutes + duration, booking, date, timeZone));
      });

      if (!availableProfessional) continue;

      slots.push({
        value,
        label: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
        profissional_id: availableProfessional.id,
        profissional_nome: availableProfessional.nome,
      });
    }
  }

  return NextResponse.json({ slots });
}
