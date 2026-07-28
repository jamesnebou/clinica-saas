const DEFAULT_DAYS = ["1", "2", "3", "4", "5", "6"];

export function minutesFromTime(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function localTimeFromDate(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function periodFromValues(inicio, fim) {
  const start = minutesFromTime(inicio);
  const end = minutesFromTime(fim);

  if (start === null || end === null || end <= start) return null;
  return { inicio, fim, start, end };
}

export function normalizeInactiveDates(value = []) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  return value
    .map((item) => ({
      data: String(item?.data || "").trim(),
      motivo: String(item?.motivo || "").trim(),
    }))
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.data))
    .filter((item) => {
      if (seen.has(item.data)) return false;
      seen.add(item.data);
      return true;
    })
    .sort((a, b) => a.data.localeCompare(b.data));
}

export function inactiveDateFor(schedule = {}, date) {
  const value = date instanceof Date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : String(date || "").slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return normalizeInactiveDates(schedule.datas_inativas).find((item) => item.data === value) || null;
}

export function defaultLegacySchedule(schedule = {}) {
  const period = periodFromValues(schedule.inicio || "08:00", schedule.fim || "18:00");
  const days = Array.isArray(schedule.dias) && schedule.dias.length ? schedule.dias.map(String) : DEFAULT_DAYS;
  const dias_config = {};

  for (const day of ["0", "1", "2", "3", "4", "5", "6"]) {
    dias_config[day] = {
      ativo: days.includes(day),
      periodos: days.includes(day) && period ? [{ inicio: period.inicio, fim: period.fim }] : [],
    };
  }

  return {
    inicio: schedule.inicio || "08:00",
    fim: schedule.fim || "18:00",
    dias: days,
    dias_config,
  };
}

export function normalizeSchedule(schedule = {}) {
  const legacy = defaultLegacySchedule(schedule);
  const source = schedule.dias_config && typeof schedule.dias_config === "object" ? schedule.dias_config : legacy.dias_config;
  const datas_inativas = normalizeInactiveDates(schedule.datas_inativas);
  const dias_config = {};
  const dias = [];

  for (const day of ["0", "1", "2", "3", "4", "5", "6"]) {
    const row = source[day] || {};
    const rawPeriods = Array.isArray(row.periodos) ? row.periodos : [];
    const periodos = rawPeriods
      .map((period) => periodFromValues(period.inicio, period.fim))
      .filter(Boolean)
      .map((period) => ({ inicio: period.inicio, fim: period.fim }));

    const ativo = Boolean(row.ativo) && periodos.length > 0;
    dias_config[day] = { ativo, periodos };
    if (ativo) dias.push(day);
  }

  return {
    inicio: schedule.inicio || legacy.inicio,
    fim: schedule.fim || legacy.fim,
    dias: dias.length ? dias : legacy.dias,
    dias_config,
    datas_inativas,
  };
}

export function getWorkingPeriods(schedule = {}, day) {
  const normalized = normalizeSchedule(schedule);
  const config = normalized.dias_config[String(day)];

  if (!config?.ativo) return [];

  return (config.periodos || [])
    .map((period) => periodFromValues(period.inicio, period.fim))
    .filter(Boolean);
}

export function isWithinWorkingPeriods({ schedule, startDate, endDate }) {
  if (!startDate || !endDate || startDate.toDateString() !== endDate.toDateString()) return false;
  if (inactiveDateFor(schedule, startDate)) return false;

  const startsAt = localTimeFromDate(startDate);
  const endsAt = localTimeFromDate(endDate);
  const periods = getWorkingPeriods(schedule, String(startDate.getDay()));

  return periods.some((period) => startsAt >= period.start && endsAt <= period.end);
}

export function buildScheduleFromForm(formData) {
  const dias_config = {};
  const activeDays = [];

  for (const day of ["0", "1", "2", "3", "4", "5", "6"]) {
    const periodos = [
      { inicio: String(formData.get(`exp_${day}_inicio_1`) || "").trim(), fim: String(formData.get(`exp_${day}_fim_1`) || "").trim() },
      { inicio: String(formData.get(`exp_${day}_inicio_2`) || "").trim(), fim: String(formData.get(`exp_${day}_fim_2`) || "").trim() },
    ].filter((period) => periodFromValues(period.inicio, period.fim));
    const ativo = formData.get(`exp_${day}_ativo`) === "on" && periodos.length > 0;

    dias_config[day] = { ativo, periodos };
    if (ativo) activeDays.push(day);
  }

  const firstPeriod = Object.values(dias_config).flatMap((row) => row.periodos || [])[0] || { inicio: "08:00", fim: "18:00" };

  return {
    inicio: firstPeriod.inicio,
    fim: firstPeriod.fim,
    dias: activeDays.length ? activeDays : DEFAULT_DAYS,
    dias_config,
    datas_inativas: normalizeInactiveDates(
      Array.from({ length: 12 }, (_, index) => ({
        data: String(formData.get(`inactive_date_${index}`) || "").trim(),
        motivo: String(formData.get(`inactive_reason_${index}`) || "").trim(),
      }))
    ),
  };
}
