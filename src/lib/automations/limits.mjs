export const DEFAULT_AUTOMATION_LIMITS = Object.freeze({
  maxDefinitionBytes: 64 * 1024,
  maxConditionDepth: 4,
  maxConditions: 40,
  maxSteps: 40,
  maxWaits: 10,
  maxAttempts: 5,
  maxAutomationDepth: 5,
  maxActiveAutomations: null,
  maxMonthlyRuns: null,
});

export function resolveAutomationLimits(metadata = {}) {
  const configured = metadata?.automation_limits || {};
  const numeric = (key, fallback, min, max) => {
    if (configured[key] === null || configured[key] === undefined || configured[key] === "") return fallback;
    const value = Number(configured[key]);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;
  };
  return {
    ...DEFAULT_AUTOMATION_LIMITS,
    maxDefinitionBytes: numeric("maxDefinitionBytes", DEFAULT_AUTOMATION_LIMITS.maxDefinitionBytes, 4096, 262144),
    maxConditionDepth: numeric("maxConditionDepth", DEFAULT_AUTOMATION_LIMITS.maxConditionDepth, 1, 8),
    maxConditions: numeric("maxConditions", DEFAULT_AUTOMATION_LIMITS.maxConditions, 1, 100),
    maxSteps: numeric("maxSteps", DEFAULT_AUTOMATION_LIMITS.maxSteps, 1, 100),
    maxWaits: numeric("maxWaits", DEFAULT_AUTOMATION_LIMITS.maxWaits, 0, 25),
    maxAttempts: numeric("maxAttempts", DEFAULT_AUTOMATION_LIMITS.maxAttempts, 1, 8),
    maxAutomationDepth: numeric("maxAutomationDepth", DEFAULT_AUTOMATION_LIMITS.maxAutomationDepth, 1, 10),
    maxActiveAutomations: numeric("maxActiveAutomations", null, 1, 1000),
    maxMonthlyRuns: numeric("maxMonthlyRuns", null, 1, 10_000_000),
  };
}
