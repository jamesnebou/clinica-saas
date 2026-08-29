import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { continueAutomationRun, processAutomationOutboxEvent, resumeAutomationWait } from "./engine.js";
import { completeAutomationEvent, retryAutomationEvent } from "./events.js";

export async function runAutomationWorker({ batchSize = 25, workerId = `automation-${randomUUID()}` } = {}) {
  const startedAt = Date.now();
  const safeBatchSize = Math.max(1, Math.min(Number(batchSize) || 25, 100));
  const summary = {
    workerId,
    batchSize: safeBatchSize,
    financeEventsEnqueued: 0,
    eventsFound: 0,
    eventsProcessed: 0,
    runsStarted: 0,
    waitsFound: 0,
    waitsResumed: 0,
    runsFound: 0,
    runsContinued: 0,
    retriesExecuted: 0,
    failures: 0,
    durationMs: 0,
  };
  const health = await startWorkerHealth(summary).catch(() => null);
  try {
    const dueEvents = await supabaseAdmin.rpc("enqueue_due_finance_automation_events", { p_limit: Math.min(100, safeBatchSize * 4) });
    if (dueEvents.error && !["42883", "PGRST202"].includes(dueEvents.error.code)) throw dueEvents.error;
    summary.financeEventsEnqueued = Number(dueEvents.data || 0);

    const { data: events, error: eventClaimError } = await supabaseAdmin.rpc("claim_domain_outbox_events_for_consumer", { p_consumer: "automation", p_worker: workerId, p_limit: safeBatchSize });
    if (eventClaimError) throw eventClaimError;
    summary.eventsFound = (events || []).length;
    summary.retriesExecuted += (events || []).filter((event) => Number(event.attempts || 0) > 1).length;
    for (const event of events || []) {
      try {
        const result = await processAutomationOutboxEvent(event);
        await completeAutomationEvent(event.id);
        summary.eventsProcessed += 1;
        summary.runsStarted += Number(result?.matched || 0);
      } catch (error) {
        await retryAutomationEvent(event, error);
        summary.failures += 1;
      }
    }

    const { data: waits, error: waitClaimError } = await supabaseAdmin.rpc("claim_automation_waits", { p_worker: workerId, p_limit: safeBatchSize });
    if (waitClaimError) throw waitClaimError;
    summary.waitsFound = (waits || []).length;
    summary.retriesExecuted += (waits || []).filter((wait) => Number(wait.attempts || 0) > 1).length;
    for (const wait of waits || []) {
      try {
        await resumeAutomationWait(wait);
        summary.waitsResumed += 1;
      } catch (error) {
        await supabaseAdmin.from("automation_waits").update({ status: Number(wait.attempts || 1) >= 5 ? "failed" : "pending", resume_at: new Date(Date.now() + 5 * 60_000).toISOString(), locked_at: null, locked_by: null, last_error: String(error.message || error).slice(0, 800) }).eq("id", wait.id);
        summary.failures += 1;
      }
    }

    const { data: runs, error: runClaimError } = await supabaseAdmin.rpc("claim_automation_runs", { p_worker: workerId, p_limit: safeBatchSize });
    if (runClaimError) throw runClaimError;
    summary.runsFound = (runs || []).length;
    summary.retriesExecuted += (runs || []).filter((run) => Number(run.attempts || 0) > 1).length;
    for (const run of runs || []) {
      try {
        const result = await continueAutomationRun(run.id);
        summary.runsContinued += 1;
        if (result?.status === "queued") summary.failures += 1;
      } catch {
        summary.failures += 1;
      }
    }
    summary.durationMs = Math.max(0, Date.now() - startedAt);
    await finishWorkerHealth(health, summary, "completed").catch(() => {});
    return publicSummary(summary);
  } catch (error) {
    summary.failures += 1;
    summary.durationMs = Math.max(0, Date.now() - startedAt);
    await finishWorkerHealth(health, summary, "failed", error).catch(() => {});
    throw error;
  }
}

async function startWorkerHealth(summary) {
  const { data, error } = await supabaseAdmin.from("automation_worker_executions").insert({
    worker_id: summary.workerId,
    status: "running",
    batch_size: summary.batchSize,
  }).select("id").single();
  if (error) throw error;
  return data?.id || null;
}

async function finishWorkerHealth(id, summary, status, error = null) {
  if (!id) return;
  await supabaseAdmin.from("automation_worker_executions").update({
    status,
    completed_at: new Date().toISOString(),
    duration_ms: summary.durationMs,
    finance_events_enqueued: summary.financeEventsEnqueued,
    events_found: summary.eventsFound,
    events_processed: summary.eventsProcessed,
    runs_started: summary.runsStarted,
    waits_found: summary.waitsFound,
    waits_resumed: summary.waitsResumed,
    runs_found: summary.runsFound,
    runs_continued: summary.runsContinued,
    retries_executed: summary.retriesExecuted,
    failures: summary.failures,
    fatal_error_code: error?.code ? String(error.code).slice(0, 120) : null,
    fatal_error_message: error ? String(error.message || error).slice(0, 500) : null,
  }).eq("id", id);
}

function publicSummary(summary) {
  return {
    batchSize: summary.batchSize,
    financeEventsEnqueued: summary.financeEventsEnqueued,
    eventsFound: summary.eventsFound,
    eventsProcessed: summary.eventsProcessed,
    runsStarted: summary.runsStarted,
    waitsFound: summary.waitsFound,
    waitsResumed: summary.waitsResumed,
    runsFound: summary.runsFound,
    runsContinued: summary.runsContinued,
    retriesExecuted: summary.retriesExecuted,
    failures: summary.failures,
    durationMs: summary.durationMs,
  };
}
