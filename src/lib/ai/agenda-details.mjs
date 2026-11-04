import { clinicTimeZone, dateKeyInTimeZone, utcRangeForClinicDate } from "../clinic/schedule.js";

const PAGE_SIZE = 50;
const MAX_DAYS = 7;

function addDays(key, days) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validDate(raw) {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${raw}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : null;
}

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function datesInQuestion(question) {
  const matches = [...question.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/g)];
  return matches.map(([raw]) => {
    const key = raw.includes("/") ? raw.split("/").reverse().join("-") : raw;
    return validDate(key);
  });
}

export function agendaRequestForQuestion(question, previous, clinic, now = new Date()) {
  const text = normalize(question);
  const today = dateKeyInTimeZone(now, clinicTimeZone(clinic));
  const dates = datesInQuestion(question);
  if (dates.some((date) => !date) || dates.length > 2) return null;
  let startDate;
  let endDate;
  if (dates.length === 2 && /\b(?:a|ate|e)\b/.test(text)) [startDate, endDate] = dates;
  else if (dates.length === 2) return null;
  else if (dates.length === 1) startDate = endDate = dates[0];
  else if (/\bhoje\b/.test(text) && /\bamanha\b/.test(text)) [startDate, endDate] = [today, addDays(today, 1)];
  else if (/\bamanha\b/.test(text)) startDate = endDate = addDays(today, 1);
  else if (/\bhoje\b/.test(text)) startDate = endDate = today;
  else if (previous?.startDate && previous?.endDate) [startDate, endDate] = [previous.startDate, previous.endDate];
  else startDate = endDate = today;
  if (!validDate(startDate) || !validDate(endDate)) return null;
  const span = Math.round((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86400000);
  if (span < 0 || span >= MAX_DAYS) return null;
  const status = /\b(?:nao\s+confirm|sem\s+confirm)/.test(text) ? "agendado"
    : /\bconfirmad[oa]s?\b/.test(text) ? "confirmado"
      : /\b(?:apenas|somente|desses|dessas|esses|essas)\b/.test(text) ? previous?.status || null : null;
  const mode = /\b(?:quantos|quantas|total)\b/.test(text) ? "count"
    : /\bprimeir[oa]\s+horario\b/.test(text) ? "first"
      : /\bprocedimentos?\b/.test(text) && !/\b(?:clientes?|quem)\b/.test(text) ? "procedures"
        : /\b(?:desses|dessas|esses|essas|apenas|somente)\b/.test(text) ? previous?.mode || "list" : "list";
  return { startDate, endDate, status, mode };
}

function requiredRows(result) {
  if (result.error || !Array.isArray(result.data)) throw new Error("AI_AGENDA_UNAVAILABLE");
  return result.data;
}

async function namesById(supabase, table, ids, clinicId) {
  if (!ids.length) return new Map();
  const rows = requiredRows(await supabase.from(table).select("id,nome").eq("clinica_id", clinicId).in("id", ids));
  return new Map(rows.map((row) => [row.id, row.nome]));
}

export async function getClinicAgendaDetails({ supabase, clinic, request, page = 0 }) {
  if (!clinic?.id || !Number.isInteger(page) || page < 0 || page > 1000) throw new Error("AI_FORBIDDEN");
  const timeZone = clinicTimeZone(clinic);
  const start = utcRangeForClinicDate(request.startDate, timeZone)?.start;
  const end = utcRangeForClinicDate(request.endDate, timeZone)?.end;
  if (!start || !end) throw new Error("AI_AGENDA_UNAVAILABLE");
  let query = supabase.from("agendamentos")
    .select("id,cliente_id,profissional_id,procedimento_id,procedimento_ids,inicio,status", { count: "exact" })
    .eq("clinica_id", clinic.id).gte("inicio", start.toISOString()).lt("inicio", end.toISOString())
    .order("inicio", { ascending: true }).order("id", { ascending: true });
  if (request.status) query = query.eq("status", request.status);
  const result = await query.range(page * PAGE_SIZE, page * PAGE_SIZE + (request.mode === "count" ? 0 : request.mode === "first" ? 0 : PAGE_SIZE - 1));
  const rows = requiredRows(result);
  if (!Number.isInteger(result.count)) throw new Error("AI_AGENDA_UNAVAILABLE");
  const ids = (values) => [...new Set(values.filter(Boolean))];
  const [clients, professionals, procedures] = request.mode === "count" ? [new Map(), new Map(), new Map()] : await Promise.all([
    request.mode === "procedures" ? new Map() : namesById(supabase, "clientes", ids(rows.map((row) => row.cliente_id)), clinic.id),
    namesById(supabase, "profissionais", ids(rows.map((row) => row.profissional_id)), clinic.id),
    namesById(supabase, "procedimentos", ids(rows.flatMap((row) => row.procedimento_ids?.length ? row.procedimento_ids : [row.procedimento_id])), clinic.id),
  ]);
  const appointments = (request.mode === "count" ? [] : rows).map((row) => {
    const date = new Date(row.inicio);
    const procedureIds = row.procedimento_ids?.length ? row.procedimento_ids : [row.procedimento_id];
    return {
      date: dateKeyInTimeZone(date, timeZone),
      time: new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date),
      client: request.mode === "procedures" ? null : clients.get(row.cliente_id) || "Cliente indisponível",
      procedures: ids(procedureIds).map((id) => procedures.get(id) || "Procedimento indisponível"),
      professional: professionals.get(row.profissional_id) || null,
      status: row.status,
    };
  });
  const days = await Promise.all(Array.from({ length: Math.round((Date.parse(`${request.endDate}T12:00:00Z`) - Date.parse(`${request.startDate}T12:00:00Z`)) / 86400000) + 1 }, async (_, index) => {
    const date = addDays(request.startDate, index);
    let dayQuery = supabase.from("agendamentos").select("id", { count: "exact", head: true }).eq("clinica_id", clinic.id)
      .gte("inicio", utcRangeForClinicDate(date, timeZone).start.toISOString()).lt("inicio", utcRangeForClinicDate(date, timeZone).end.toISOString());
    if (request.status) dayQuery = dayQuery.eq("status", request.status);
    const counted = await dayQuery;
    if (counted.error || !Number.isInteger(counted.count)) throw new Error("AI_AGENDA_UNAVAILABLE");
    return { date, total: counted.count, label: date === dateKeyInTimeZone(new Date(), timeZone) ? "Hoje" : date === addDays(dateKeyInTimeZone(new Date(), timeZone), 1) ? "Amanhã" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${date}T12:00:00Z`)) };
  }));
  const moreRows = !["count", "first"].includes(request.mode) && (page + 1) * PAGE_SIZE < result.count;
  return { type: "agenda_details", period: { startDate: request.startDate, endDate: request.endDate, timeZone },
    days, appointments, total: result.count, hasMore: moreRows && page < 1000, limitReached: moreRows && page === 1000,
    page, mode: request.mode, lastIntent: "agenda_details", agendaContext: { startDate: request.startDate, endDate: request.endDate, status: request.status, mode: request.mode } };
}
