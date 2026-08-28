import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { continueAutomationRun, processAutomationOutboxEvent, resumeAutomationWait } from "./engine.js";
import { completeAutomationEvent, retryAutomationEvent } from "./events.js";

export async function runAutomationWorker({ batchSize = 25, workerId = `automation-${randomUUID()}` } = {}) {
  const summary = { workerId, events: 0, runs: 0, waits: 0, retries: 0, failures: 0 };
  const dueEvents = await supabaseAdmin.rpc("enqueue_due_finance_automation_events", { p_limit: Math.min(100, batchSize * 4) });
  if (dueEvents.error && !["42883", "PGRST202"].includes(dueEvents.error.code)) throw dueEvents.error;
  const { data: events, error: eventClaimError } = await supabaseAdmin.rpc("claim_domain_outbox_events_for_consumer", { p_consumer: "automation", p_worker: workerId, p_limit: batchSize });
  if (eventClaimError) throw eventClaimError;
  for (const event of events || []) {
    try { await processAutomationOutboxEvent(event); await completeAutomationEvent(event.id); summary.events += 1; }
    catch (error) { await retryAutomationEvent(event, error); summary.failures += 1; }
  }
  const { data: waits, error: waitClaimError } = await supabaseAdmin.rpc("claim_automation_waits", { p_worker: workerId, p_limit: batchSize });
  if (waitClaimError) throw waitClaimError;
  for (const wait of waits || []) {
    try { await resumeAutomationWait(wait); summary.waits += 1; }
    catch (error) { await supabaseAdmin.from("automation_waits").update({ status: Number(wait.attempts || 1) >= 5 ? "failed" : "pending", resume_at: new Date(Date.now() + 5 * 60_000).toISOString(), locked_at: null, locked_by: null, last_error: String(error.message || error).slice(0, 800) }).eq("id", wait.id); summary.failures += 1; }
  }
  const { data: runs, error: runClaimError } = await supabaseAdmin.rpc("claim_automation_runs", { p_worker: workerId, p_limit: batchSize });
  if (runClaimError) throw runClaimError;
  for (const run of runs || []) {
    try { await continueAutomationRun(run.id); summary.runs += 1; }
    catch { summary.failures += 1; }
  }
  return summary;
}
