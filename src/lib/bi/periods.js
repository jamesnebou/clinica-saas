import { clinicTimeZone, dateFromClinicLocal } from "@/lib/clinic/schedule";
import { addDateKeyDays, dateKeyForTimeZone, resolvePeriodDateKeys } from "@/lib/domain/bi-period-core.mjs";

function rangeFromDateKeys(startKey, endExclusiveKey, timeZone) {
  return { startKey, endKey: addDateKeyDays(endExclusiveKey, -1), start: dateFromClinicLocal(`${startKey}T00:00`, timeZone), end: dateFromClinicLocal(`${endExclusiveKey}T00:00`, timeZone) };
}

export function resolveBIPeriod({ preset = "30d", customStart, customEnd, clinic, now = new Date() } = {}) {
  const timeZone = clinicTimeZone(clinic || {});
  const today = dateKeyForTimeZone(now, timeZone);
  const { startKey, endExclusiveKey, previousStartKey, label, durationDays } = resolvePeriodDateKeys({ preset, today, customStart, customEnd });
  const current = rangeFromDateKeys(startKey, endExclusiveKey, timeZone);
  const previous = rangeFromDateKeys(previousStartKey, startKey, timeZone);
  return { preset, label, timeZone, current, previous, durationDays };
}
