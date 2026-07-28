import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWorkingPeriods, inactiveDateFor } from "@/lib/clinic/schedule";

function pad(value) {
  return String(value).padStart(2, "0");
}

function localDateTime(date, minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${date}T${pad(hours)}:${pad(mins)}`;
}

function overlaps(startMinutes, endMinutes, booking) {
  const start = new Date(booking.inicio);
  const end = new Date(booking.fim);
  const bookingStart = start.getHours() * 60 + start.getMinutes();
  const bookingEnd = end.getHours() * 60 + end.getMinutes();
  return startMinutes < bookingEnd && endMinutes > bookingStart;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const slug = String(searchParams.get("slug") || "").trim();
  const procedimentoId = String(searchParams.get("procedimento_id") || "").trim();
  const profissionalId = String(searchParams.get("profissional_id") || "").trim();
  const date = String(searchParams.get("date") || "").trim();

  if (!slug || !procedimentoId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
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
    return NextResponse.json({ slots: [], message: "Clinica indisponivel." }, { status: 404 });
  }

  const { data: procedimento, error: procedimentoError } = await supabaseAdmin
    .from("procedimentos")
    .select("id, duracao_minutos")
    .eq("clinica_id", clinic.id)
    .eq("id", procedimentoId)
    .eq("ativo", true)
    .eq("publicado_site", true)
    .maybeSingle();

  if (procedimentoError) throw procedimentoError;
  if (!procedimento) return NextResponse.json({ slots: [], message: "Procedimento indisponivel." }, { status: 404 });

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
  const inactiveDate = inactiveDateFor(schedule, date);
  if (inactiveDate) {
    return NextResponse.json({ slots: [], message: inactiveDate.motivo || "Clínica sem atendimento nesta data." });
  }

  const dateAtNoon = new Date(`${date}T12:00:00`);
  const day = String(dateAtNoon.getDay());
  const periods = getWorkingPeriods(schedule, day);

  if (!periods.length) {
    return NextResponse.json({ slots: [], message: "Dia fora do expediente da clinica." });
  }

  const duration = Math.max(1, Number(procedimento.duracao_minutos || 60));

  if (!periods.some((period) => period.end >= period.start + duration)) {
    return NextResponse.json({ slots: [], message: "Expediente insuficiente para este procedimento." });
  }

  const startISO = new Date(`${date}T00:00:00`).toISOString();
  const endISO = new Date(`${date}T23:59:59`).toISOString();
  const { data: bookings = [], error: bookingsError } = await supabaseAdmin
    .from("agendamentos")
    .select("id, profissional_id, inicio, fim, status")
    .eq("clinica_id", clinic.id)
    .in("profissional_id", profissionais.map((item) => item.id))
    .not("status", "eq", "cancelado")
    .gte("inicio", startISO)
    .lte("inicio", endISO);

  if (bookingsError) throw bookingsError;

  const now = new Date();
  const slots = [];

  for (const period of periods) {
    for (let minutes = period.start; minutes + duration <= period.end; minutes += 30) {
      const value = localDateTime(date, minutes);
      const slotDate = new Date(value);
      if (slotDate <= now) continue;

      const availableProfessional = profissionais.find((professional) => {
        const professionalBookings = bookings.filter((booking) => booking.profissional_id === professional.id);
        return !professionalBookings.some((booking) => overlaps(minutes, minutes + duration, booking));
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
