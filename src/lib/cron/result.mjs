function metric(value) {
  return Math.max(0, Number(value) || 0);
}

export function workerHttpResult(summary = {}) {
  const processed = metric(summary.processed);
  const succeeded = metric(summary.succeeded);
  const skipped = metric(summary.skipped);
  const retryScheduled = metric(summary.retryScheduled);
  const failed = metric(summary.failed);
  const dead = metric(summary.dead);
  const operationalFailures = retryScheduled + failed + dead;
  const ok = operationalFailures === 0;
  const partial = !ok && succeeded + skipped > 0;

  return {
    status: ok ? 200 : 422,
    body: {
      ...summary,
      ok,
      partial,
      processed,
      succeeded,
      skipped,
      retryScheduled,
      failed,
      dead,
    },
  };
}
