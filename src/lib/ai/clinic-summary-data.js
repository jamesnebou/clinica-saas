import { clinicTimeZone, dateKeyInTimeZone, utcRangeForClinicDate } from "@/lib/clinic/schedule";
import { summarizeClinicRows, validateSummaryDays } from "./clinic-summary-core.mjs";

const PAGE_SIZE = 500;
const MAX_ROWS = 5000;

function addDays(key, days) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildSummaryPeriod(clinic, days, now = new Date()) {
  validateSummaryDays(days);
  const timezone = clinicTimeZone(clinic);
  const today = dateKeyInTimeZone(now, timezone);
  const start = utcRangeForClinicDate(addDays(today, 1 - days), timezone).start.toISOString();
  const end = utcRangeForClinicDate(addDays(today, 1), timezone).start.toISOString();
  const previousStart = utcRangeForClinicDate(addDays(today, 1 - days * 2), timezone).start.toISOString();
  return { days, start, end, previousStart, previousEnd: start, timezone };
}

async function boundedRows(query) {
  const rows = [];
  for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error("AI_DATA_UNAVAILABLE");
    rows.push(...(data || []));
    if (rows.length > MAX_ROWS) throw new Error("AI_DATA_TOO_LARGE");
    if ((data || []).length < PAGE_SIZE) return rows;
  }
  throw new Error("AI_DATA_TOO_LARGE");
}

async function count(query) {
  const { count: total, error } = await query;
  if (error || !Number.isInteger(total)) throw new Error("AI_DATA_UNAVAILABLE");
  return total;
}

export async function getClinicSummarySnapshot({ supabase, clinic, days, now = new Date() }) {
  if (!clinic?.id) throw new Error("AI_FORBIDDEN");
  const clinicId = clinic.id;
  const period = buildSummaryPeriod(clinic, days, now);
  const upcomingEnd = new Date(now.getTime() + 7 * 86400000).toISOString();
  const [appointments, movements, customerTotal, newCustomers, upcoming] = await Promise.all([
    boundedRows(supabase.from("agendamentos").select("inicio,status,procedimento_id").eq("clinica_id", clinicId).gte("inicio", period.previousStart).lt("inicio", period.end).order("inicio")),
    boundedRows(supabase.from("finance_movimentos").select("data_movimento,tipo,valor_liquido").eq("clinica_id", clinicId).gte("data_movimento", period.previousStart).lt("data_movimento", period.end).order("data_movimento")),
    count(supabase.from("clientes").select("id", { count: "exact", head: true }).eq("clinica_id", clinicId)),
    count(supabase.from("clientes").select("id", { count: "exact", head: true }).eq("clinica_id", clinicId).gte("created_at", period.start).lt("created_at", period.end)),
    count(supabase.from("agendamentos").select("id", { count: "exact", head: true }).eq("clinica_id", clinicId).gte("inicio", now.toISOString()).lt("inicio", upcomingEnd).in("status", ["agendado", "confirmado"])),
  ]);
  const procedureIds = [...new Set(appointments.map((row) => row.procedimento_id).filter(Boolean))];
  const procedureNames = new Map();
  for (let i = 0; i < procedureIds.length; i += 100) {
    const { data, error } = await supabase.from("procedimentos").select("id,nome").eq("clinica_id", clinicId).in("id", procedureIds.slice(i, i + 100));
    if (error) throw new Error("AI_DATA_UNAVAILABLE");
    for (const row of data || []) procedureNames.set(row.id, row.nome);
  }
  return summarizeClinicRows({ period, appointments, movements, customerTotal, newCustomers, procedureNames, upcoming });
}
