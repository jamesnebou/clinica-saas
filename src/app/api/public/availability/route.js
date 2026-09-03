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
import { buildCalendarMonth, shiftMonthKey } from "@/lib/public-booking/calendar-core.mjs";

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

function slotsForDate({ date, schedule, timeZone, duration, profissionais, bookings, now }) {
  const inactiveDate = inactiveDateFor(schedule, date, timeZone);
  if (inactiveDate) return { slots: [], message: inactiveDate.motivo || "Clínica sem atendimento nesta data." };

  const periods = getWorkingPeriods(schedule, weekdayFromDateKey(date));
  if (!periods.length) return { slots: [], message: "A clínica não atende nesta data." };
  if (!periods.some((period) => period.end >= period.start + duration)) {
    return { slots: [], message: "Expediente insuficiente para os procedimentos selecionados." };
  }

  const bookingsByProfessional = new Map();
  bookings.forEach((booking) => {
    const current = bookingsByProfessional.get(booking.profissional_id) || [];
    current.push(booking);
    bookingsByProfessional.set(booking.profissional_id, current);
  });

  const slots = [];
  for (const period of periods) {
    for (let minutes = period.start; minutes + duration <= period.end; minutes += 30) {
      const value = localDateTime(date, minutes);
      const slotDate = dateFromClinicLocal(value, timeZone);
      if (!slotDate || slotDate <= now) continue;

      const availableProfessional = profissionais.find((professional) => (
        !(bookingsByProfessional.get(professional.id) || []).some((booking) => overlaps(minutes, minutes + duration, booking, date, timeZone))
      ));
      if (!availableProfessional) continue;

      slots.push({
        value,
        label: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
        profissional_id: availableProfessional.id,
        profissional_nome: availableProfessional.nome,
      });
    }
  }

  return { slots, message: slots.length ? "" : "Nenhum horário disponível para esta data." };
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
  const month = String(searchParams.get("month") || "").trim();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const validMonth = /^\d{4}-\d{2}$/.test(month);

  if (!slug || !procedimentoIds.length || (!validDate && !validMonth)) {
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
  const duration = totalAppointmentMinutes(procedimentos, { defaultDuration: 60, includeIntervals: true });
  const dates = validMonth
    ? buildCalendarMonth(month).filter((day) => day.inMonth).map((day) => day.date)
    : [date];
  const firstDate = dates[0];
  const nextMonth = validMonth ? shiftMonthKey(month, 1) : "";
  const startRange = utcRangeForClinicDate(firstDate, timeZone);
  const endRange = validMonth
    ? utcRangeForClinicDate(`${nextMonth}-01`, timeZone)
    : utcRangeForClinicDate(date, timeZone);
  if (!startRange || !endRange) return NextResponse.json({ slots: [], message: "Data inválida." }, { status: 400 });

  const { data: bookings = [], error: bookingsError } = await supabaseAdmin
    .from("agendamentos")
    .select("id, profissional_id, inicio, fim, status")
    .eq("clinica_id", clinic.id)
    .in("profissional_id", profissionais.map((item) => item.id))
    .not("status", "eq", "cancelado")
    .gte("inicio", startRange.start.toISOString())
    .lt("inicio", validMonth ? endRange.start.toISOString() : endRange.end.toISOString());

  if (bookingsError) throw bookingsError;

  const now = new Date();
  if (validMonth) {
    const bookingsByDate = new Map();
    bookings.forEach((booking) => {
      const bookingDate = dateKeyInTimeZone(new Date(booking.inicio), timeZone);
      const current = bookingsByDate.get(bookingDate) || [];
      current.push(booking);
      bookingsByDate.set(bookingDate, current);
    });
    const availableDates = dates.filter((item) => slotsForDate({
      date: item,
      schedule,
      timeZone,
      duration,
      profissionais,
      bookings: bookingsByDate.get(item) || [],
      now,
    }).slots.length > 0);
    return NextResponse.json({ available_dates: availableDates });
  }

  return NextResponse.json(slotsForDate({ date, schedule, timeZone, duration, profissionais, bookings, now }));
}
