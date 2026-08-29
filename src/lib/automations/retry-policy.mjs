export function automationRetryDecision({ attempts, maxAttempts, error, now = Date.now() }) {
  const currentAttempt = Math.max(1, Number(attempts || 1));
  const maximum = Math.max(1, Number(maxAttempts || 1));
  if (error?.permanent || currentAttempt >= maximum) {
    return { retry: false, delayMinutes: null, nextAttemptAt: null };
  }
  const delayMinutes = Math.min(60, 2 ** Math.max(0, currentAttempt - 1));
  return {
    retry: true,
    delayMinutes,
    nextAttemptAt: new Date(Number(now) + delayMinutes * 60_000).toISOString(),
  };
}
