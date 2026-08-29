const UNIT_MS = Object.freeze({ minutes: 60_000, hours: 3_600_000, days: 86_400_000 });

function localParts(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0) };
}

function partsAt(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  return Object.fromEntries(parts.filter((item) => item.type !== "literal").map((item) => [item.type, Number(item.value)]));
}

export function zonedLocalToUtc(value, timeZone) {
  const target = localParts(value);
  if (!target) throw new Error("Data local inválida. Use AAAA-MM-DDTHH:mm.");
  const targetMs = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
  let candidate = targetMs;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shown = partsAt(new Date(candidate), timeZone);
    const shownMs = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    candidate += targetMs - shownMs;
  }
  return new Date(candidate).toISOString();
}

export function calculateWaitResumeAt(step, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error("Relógio de referência inválido.");
  if (step?.mode === "until") {
    const raw = String(step.until || "");
    if (/Z$|[+-]\d{2}:\d{2}$/.test(raw)) {
      const parsed = Date.parse(raw);
      if (!Number.isFinite(parsed)) throw new Error("Data de espera inválida.");
      return new Date(parsed).toISOString();
    }
    return zonedLocalToUtc(raw, options.timeZone || "America/Bahia");
  }
  const multiplier = UNIT_MS[step?.unit];
  const amount = Number(step?.amount);
  if (!multiplier || !Number.isFinite(amount) || amount <= 0) throw new Error("Duração de espera inválida.");
  return new Date(now.getTime() + amount * multiplier).toISOString();
}
