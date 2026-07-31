const DEFAULT_DAYS = ["1", "2", "3", "4", "5", "6"];
export const DEFAULT_CLINIC_TIME_ZONE = "America/Bahia";

const DAY_NAME_TO_INDEX = {
  domingo: "0",
  segunda: "1",
  segundafeira: "1",
  terca: "2",
  tercafeira: "2",
  quarta: "3",
  quartafeira: "3",
  quinta: "4",
  quintafeira: "4",
  sexta: "5",
  sextafeira: "5",
  sabado: "6",
};

const dateTimeFormatters = new Map();

function dateTimeFormatter(timeZone) {
  if (!dateTimeFormatters.has(timeZone)) {
    dateTimeFormatters.set(timeZone, new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }));
  }

  return dateTimeFormatters.get(timeZone);
}

function zonedParts(date, timeZone) {
  const values = {};
  for (const part of dateTimeFormatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return values;
}

function validTimeZone(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return "";

  try {
    dateTimeFormatter(candidate).format(new Date());
    return candidate;
  } catch {
    return "";
  }
}

export function clinicTimeZone(clinicOrMetadata = {}) {
  const metadata = clinicOrMetadata?.metadata || clinicOrMetadata || {};
  return validTimeZone(
    metadata.timezone
    || metadata.fuso_horario
    || metadata.site_publico?.timezone,
  ) || DEFAULT_CLINIC_TIME_ZONE;
}

export function minutesFromTime(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function dateKeyInTimeZone(date, timeZone = DEFAULT_CLINIC_TIME_ZONE) {
  const parts = zonedParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function localTimeFromDate(date, timeZone = DEFAULT_CLINIC_TIME_ZONE) {
  const parts = zonedParts(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

export function weekdayFromDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "";
  return String(new Date(`${value}T12:00:00Z`).getUTCDay());
}

export function dateFromClinicLocal(value, timeZone = DEFAULT_CLINIC_TIME_ZONE) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    const absolute = new Date(raw);
    return Number.isNaN(absolute.getTime()) ? null : absolute;
  }

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const desiredUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0),
  );

  let result = new Date(desiredUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(result, timeZone);
    const representedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const correction = desiredUtc - representedUtc;
    if (!correction) break;
    result = new Date(result.getTime() + correction);
  }

  return Number.isNaN(result.getTime()) ? null : result;
}

export function clinicDateTimeValue(date, timeZone = DEFAULT_CLINIC_TIME_ZONE) {
  const parts = zonedParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function utcRangeForClinicDate(dateKey, timeZone = DEFAULT_CLINIC_TIME_ZONE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return null;
  const start = dateFromClinicLocal(`${dateKey}T00:00`, timeZone);
  const nextDate = new Date(`${dateKey}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextDateKey = nextDate.toISOString().slice(0, 10);
  const end = dateFromClinicLocal(`${nextDateKey}T00:00`, timeZone);
  return start && end ? { start, end } : null;
}

function periodFromValues(inicio, fim) {
  const start = minutesFromTime(inicio);
  const end = minutesFromTime(fim);

  if (start === null || end === null || end <= start) return null;
  return { inicio, fim, start, end };
}

function normalizePeriods(value = []) {
  const periods = (Array.isArray(value) ? value : [])
    .map((period) => periodFromValues(period?.inicio, period?.fim))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];
  for (const period of periods) {
    const previous = merged[merged.length - 1];
    if (!previous || period.start > previous.end) {
      merged.push({ ...period });
      continue;
    }

    if (period.end > previous.end) {
      previous.end = period.end;
      previous.fim = period.fim;
    }
  }

  return merged;
}

function normalizedDayName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function namedScheduleRows(schedule = {}) {
  const rows = {};

  for (const [key, row] of Object.entries(schedule)) {
    const day = DAY_NAME_TO_INDEX[normalizedDayName(key)];
    if (day === undefined || !row || typeof row !== "object") continue;

    const periodos = Array.isArray(row.periodos)
      ? row.periodos
      : [
          { inicio: row.inicio, fim: row.fim },
          {
            inicio: row.inicio_2 || row.segundo_inicio || row.reabre,
            fim: row.fim_2 || row.segundo_fim || row.fecha_novamente,
          },
        ];

    rows[day] = {
      ativo: row.ativo !== false,
      periodos,
    };
  }

  return rows;
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

export function inactiveDateFor(schedule = {}, date, timeZone = DEFAULT_CLINIC_TIME_ZONE) {
  const value = date instanceof Date
    ? dateKeyInTimeZone(date, timeZone)
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
  const namedRows = namedScheduleRows(schedule);
  const configuredRows = schedule.dias_config && typeof schedule.dias_config === "object"
    ? schedule.dias_config
    : {};
  const datas_inativas = normalizeInactiveDates(schedule.datas_inativas);
  const dias_config = {};
  const dias = [];

  for (const day of ["0", "1", "2", "3", "4", "5", "6"]) {
    const row = Object.prototype.hasOwnProperty.call(configuredRows, day)
      ? configuredRows[day]
      : namedRows[day] || legacy.dias_config[day] || {};
    const periods = normalizePeriods(row?.periodos);
    const periodos = periods.map((period) => ({ inicio: period.inicio, fim: period.fim }));
    const ativo = Boolean(row?.ativo) && periodos.length > 0;

    dias_config[day] = { ativo, periodos };
    if (ativo) dias.push(day);
  }

  return {
    inicio: schedule.inicio || legacy.inicio,
    fim: schedule.fim || legacy.fim,
    dias,
    dias_config,
    datas_inativas,
  };
}

export function getWorkingPeriods(schedule = {}, day) {
  const normalized = normalizeSchedule(schedule);
  const config = normalized.dias_config[String(day)];

  if (!config?.ativo) return [];
  return normalizePeriods(config.periodos);
}

export function isWithinWorkingPeriods({
  schedule,
  startDate,
  endDate,
  timeZone = DEFAULT_CLINIC_TIME_ZONE,
}) {
  if (!startDate || !endDate) return false;

  const startDateKey = dateKeyInTimeZone(startDate, timeZone);
  const endDateKey = dateKeyInTimeZone(endDate, timeZone);
  if (startDateKey !== endDateKey || inactiveDateFor(schedule, startDateKey, timeZone)) return false;

  const startsAt = localTimeFromDate(startDate, timeZone);
  const endsAt = localTimeFromDate(endDate, timeZone);
  const periods = getWorkingPeriods(schedule, weekdayFromDateKey(startDateKey));

  return periods.some((period) => startsAt >= period.start && endsAt <= period.end);
}

export function buildScheduleFromForm(formData) {
  const dias_config = {};
  const activeDays = [];

  for (const day of ["0", "1", "2", "3", "4", "5", "6"]) {
    const periodos = normalizePeriods([
      { inicio: String(formData.get(`exp_${day}_inicio_1`) || "").trim(), fim: String(formData.get(`exp_${day}_fim_1`) || "").trim() },
      { inicio: String(formData.get(`exp_${day}_inicio_2`) || "").trim(), fim: String(formData.get(`exp_${day}_fim_2`) || "").trim() },
    ]).map((period) => ({ inicio: period.inicio, fim: period.fim }));
    const ativo = formData.get(`exp_${day}_ativo`) === "on" && periodos.length > 0;

    dias_config[day] = { ativo, periodos };
    if (ativo) activeDays.push(day);
  }

  const firstPeriod = Object.values(dias_config).flatMap((row) => row.periodos || [])[0] || { inicio: "08:00", fim: "18:00" };

  return {
    inicio: firstPeriod.inicio,
    fim: firstPeriod.fim,
    dias: activeDays,
    dias_config,
    datas_inativas: normalizeInactiveDates(
      Array.from({ length: 12 }, (_, index) => ({
        data: String(formData.get(`inactive_date_${index}`) || "").trim(),
        motivo: String(formData.get(`inactive_reason_${index}`) || "").trim(),
      })),
    ),
  };
}
