export function normalizeDemoEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function matchesDemoEmail(value, configuredEmail) {
  const candidate = normalizeDemoEmail(value);
  const configured = normalizeDemoEmail(configuredEmail);
  return Boolean(candidate && configured && candidate === configured);
}

export function shouldRestoreDemoSession({ demoClinic = false, authenticated = false } = {}) {
  return Boolean(demoClinic && authenticated);
}
