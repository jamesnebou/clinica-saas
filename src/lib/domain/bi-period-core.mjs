export function addDateKeyDays(dateKey, amount) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function monthStart(dateKey) { return `${dateKey.slice(0, 7)}-01`; }
function addMonths(dateKey, amount) {
  const date = new Date(`${monthStart(dateKey)}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}
function quarterStart(dateKey) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  return `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
}

export function dateKeyForTimeZone(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function resolvePeriodDateKeys({ preset = "30d", today, customStart, customEnd }) {
  let startKey;
  let endExclusiveKey;
  let label;
  switch (preset) {
    case "today": startKey = today; endExclusiveKey = addDateKeyDays(today, 1); label = "Hoje"; break;
    case "yesterday": startKey = addDateKeyDays(today, -1); endExclusiveKey = today; label = "Ontem"; break;
    case "7d": startKey = addDateKeyDays(today, -6); endExclusiveKey = addDateKeyDays(today, 1); label = "Últimos 7 dias"; break;
    case "month": startKey = monthStart(today); endExclusiveKey = addMonths(today, 1); label = "Mês atual"; break;
    case "previous_month": startKey = addMonths(today, -1); endExclusiveKey = monthStart(today); label = "Mês anterior"; break;
    case "quarter": startKey = quarterStart(today); endExclusiveKey = addMonths(quarterStart(today), 3); label = "Trimestre atual"; break;
    case "year": startKey = `${today.slice(0, 4)}-01-01`; endExclusiveKey = `${Number(today.slice(0, 4)) + 1}-01-01`; label = "Ano atual"; break;
    case "custom": {
      const first = /^\d{4}-\d{2}-\d{2}$/.test(customStart || "") ? customStart : today;
      const last = /^\d{4}-\d{2}-\d{2}$/.test(customEnd || "") ? customEnd : first;
      startKey = first <= last ? first : last;
      endExclusiveKey = addDateKeyDays(first <= last ? last : first, 1);
      label = "Período personalizado";
      break;
    }
    case "30d":
    default: startKey = addDateKeyDays(today, -29); endExclusiveKey = addDateKeyDays(today, 1); label = "Últimos 30 dias"; break;
  }
  const durationDays = Math.max(1, Math.round((new Date(`${endExclusiveKey}T12:00:00Z`) - new Date(`${startKey}T12:00:00Z`)) / 86400000));
  return { startKey, endExclusiveKey, previousStartKey: addDateKeyDays(startKey, -durationDays), label, durationDays };
}
