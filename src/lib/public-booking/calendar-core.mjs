const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateFromKey(value) {
  const match = String(value || "").match(DATE_KEY_PATTERN);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function clinicDateKey(timeZone, date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDaysToDateKey(value, amount) {
  const date = dateFromKey(value);
  if (!date || !Number.isInteger(amount)) return "";
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKey(date);
}

export function monthKeyFromDateKey(value) {
  const date = dateFromKey(value);
  return date ? dateKey(date).slice(0, 7) : "";
}

export function shiftMonthKey(value, amount) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match || !Number.isInteger(amount)) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + amount, 1, 12));
  return dateKey(date).slice(0, 7);
}

export function buildCalendarMonth(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return [];

  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      date: dateKey(date),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1,
    };
  });
}

export function formatBrazilianDate(value) {
  const date = dateFromKey(value);
  return date ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "long" }).format(date) : "";
}

export function formatCalendarMonth(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 12));
  const label = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
