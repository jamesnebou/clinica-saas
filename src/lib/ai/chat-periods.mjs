import { clinicTimeZone, dateKeyInTimeZone, utcRangeForClinicDate } from "../clinic/schedule.js";

export const chatPeriodKeys = ["today", "yesterday", "tomorrow", "this_week", "last_week", "this_month", "last_month", "last_7_days", "last_30_days"];

const labels = {
  today: "Hoje", yesterday: "Ontem", tomorrow: "Amanhã", this_week: "Esta semana",
  last_week: "Semana passada", this_month: "Este mês", last_month: "Mês passado",
  last_7_days: "Últimos 7 dias", last_30_days: "Últimos 30 dias",
};

function addDays(key, amount) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000);
}

function monthStart(key, offset = 0) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
}

export function buildChatPeriod(clinic, key, now = new Date()) {
  if (!chatPeriodKeys.includes(key)) throw new Error("INVALID_PERIOD");
  const timezone = clinicTimeZone(clinic);
  const today = dateKeyInTimeZone(now, timezone);
  const tomorrow = addDays(today, 1);
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const weekStart = addDays(today, -weekday);
  let startKey;
  let endKey;
  let previousStartKey;
  let previousEndKey;
  switch (key) {
    case "today": [startKey, endKey, previousStartKey, previousEndKey] = [today, tomorrow, addDays(today, -1), today]; break;
    case "yesterday": [startKey, endKey, previousStartKey, previousEndKey] = [addDays(today, -1), today, addDays(today, -2), addDays(today, -1)]; break;
    case "tomorrow": [startKey, endKey, previousStartKey, previousEndKey] = [tomorrow, addDays(today, 2), today, tomorrow]; break;
    case "this_week": [startKey, endKey, previousStartKey, previousEndKey] = [weekStart, tomorrow, addDays(weekStart, -7), addDays(tomorrow, -7)]; break;
    case "last_week": [startKey, endKey, previousStartKey, previousEndKey] = [addDays(weekStart, -7), weekStart, addDays(weekStart, -14), addDays(weekStart, -7)]; break;
    case "this_month": {
      startKey = monthStart(today); endKey = tomorrow;
      previousStartKey = monthStart(today, -1);
      previousEndKey = addDays(previousStartKey, Math.min(daysBetween(startKey, endKey), daysBetween(previousStartKey, startKey)));
      break;
    }
    case "last_month": [startKey, endKey, previousStartKey, previousEndKey] = [monthStart(today, -1), monthStart(today), monthStart(today, -2), monthStart(today, -1)]; break;
    case "last_7_days": [startKey, endKey, previousStartKey, previousEndKey] = [addDays(today, -6), tomorrow, addDays(today, -13), addDays(today, -6)]; break;
    case "last_30_days": [startKey, endKey, previousStartKey, previousEndKey] = [addDays(today, -29), tomorrow, addDays(today, -59), addDays(today, -29)]; break;
  }
  const toUtc = (dateKey) => utcRangeForClinicDate(dateKey, timezone).start.toISOString();
  return { key, label: labels[key], days: daysBetween(startKey, endKey), previousDays: daysBetween(previousStartKey, previousEndKey), start: toUtc(startKey), end: toUtc(endKey),
    previousStart: toUtc(previousStartKey), previousEnd: toUtc(previousEndKey), timezone };
}

export function fallbackPeriodKey(question, previousKey = null, selectedDays = 30) {
  const text = question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\bmes passado\b/.test(text)) return "last_month";
  if (/\b(?:este|esse|neste) mes\b/.test(text)) return "this_month";
  if (/\bsemana passada\b/.test(text)) return "last_week";
  if (/\b(?:esta|essa|nesta) semana\b/.test(text)) return "this_week";
  if (/\bultimos? 7 dias\b/.test(text)) return "last_7_days";
  if (/\bultimos? 30 dias\b/.test(text)) return "last_30_days";
  if (/\bamanha\b/.test(text)) return "tomorrow";
  if (/\bontem\b/.test(text)) return "yesterday";
  if (/\bhoje\b/.test(text)) return "today";
  return previousKey && chatPeriodKeys.includes(previousKey) ? previousKey : selectedDays === 7 ? "last_7_days" : "last_30_days";
}
