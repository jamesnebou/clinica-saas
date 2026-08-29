import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { evaluateConditionGroup } from "./conditions.mjs";
import { resolveAutomationContext } from "./context.js";
import { executeRegisteredAction } from "./executor.js";
import { normalizeAutomationEvent } from "./events.js";
import { evaluateLoopGuard } from "./loop-guard.mjs";
import { resolveAutomationLimits } from "./limits.mjs";
import { auditAutomation, recordAutomationMetric } from "./observability.js";
import { calculateWaitResumeAt } from "./time.mjs";
import { deterministicActionKey } from "./core.mjs";
import { automationRetryDecision } from "./retry-policy.mjs";

function safeError(error) { return { code: error?.code || "AUTOMATION_FAILED", message: String(error?.message || error || "Falha desconhecida").slice(0, 800) }; }

async function logStep(run, step, status, result = {}, error = null) {
  const now = new Date().toISOString();
  const row = { clinica_id: run.clinica_id, run_id: run.id, step_id: step.id, step_index: run.current_step_index, step_type: step.type, action_type: step.actionType || null, status, attempt: Math.max(1, Number(run.attempts || 1)), idempotency_key: step.type === "action" ? deterministicActionKey(run.id, step.id) : null, result, error_code: error?.code || null, error_message: error?.message ? String(error.message).slice(0, 800) : null, completed_at: ["running", "waiting"].includes(status) ? null : now };
  const { error: insertError } = await supabaseAdmin.from("automation_run_steps").upsert(row, { onConflict: "run_id,step_id,attempt" });
  if (insertError) throw insertError;
}

async function finishRun(run, status, failure = null) {
  const update = { status, completed_at: new Date().toISOString(), locked_at: null, locked_by: null, updated_at: new Date().toISOString(), failure_code: failure?.code || null, failure_message: failure?.message || null };
  const { error } = await supabaseAdmin.from("automation_runs").update(update).eq("id", run.id).eq("clinica_id", run.clinica_id);
  if (error) throw error;
  await recordAutomationMetric({ clinicId: run.clinica_id, name: `automation_run_${status}`, runId: run.id, metadata: { automation_id: run.automation_id, source_event_type: run.source_event_type } });
}

async function queueRetry(run, error, limits) {
  const failure = safeError(error);
  const decision = automationRetryDecision({ attempts: run.attempts, maxAttempts: limits.maxAttempts, error });
  if (!decision.retry) return finishRun(run, "failed", failure);
  const { error: updateError } = await supabaseAdmin.from("automation_runs").update({ status: "queued", next_attempt_at: decision.nextAttemptAt, locked_at: null, locked_by: null, failure_code: failure.code, failure_message: failure.message, updated_at: new Date().toISOString() }).eq("id", run.id).eq("clinica_id", run.clinica_id);
  if (updateError) throw updateError;
}

export async function continueAutomationRun(runOrId) {
  const runId = typeof runOrId === "string" ? runOrId : runOrId.id;
  const { data: run, error: runError } = await supabaseAdmin.from("automation_runs").select("*").eq("id", runId).single();
  if (runError) throw runError;
  if (["completed", "failed", "cancelled", "skipped"].includes(run.status)) return run;
  const { data: version, error: versionError } = await supabaseAdmin.from("automation_versions").select("definition").eq("clinica_id", run.clinica_id).eq("id", run.automation_version_id).single();
  if (versionError) throw versionError;
  const limits = resolveAutomationLimits(run.context_snapshot?.clinic_metadata || {});
  let plan = Array.isArray(run.execution_plan) ? run.execution_plan : version.definition.steps || [];
  let cursor = Number(run.current_step_index || 0);
  try {
    while (cursor < plan.length) {
      const step = plan[cursor];
      const currentRun = { ...run, current_step_index: cursor };
      const context = await resolveAutomationContext(run.context_snapshot.event);
      if (step.type === "condition") {
        const matched = evaluateConditionGroup(step.conditions, context);
        await logStep(currentRun, step, matched ? "completed" : "skipped", { matched });
        if (!matched) { await finishRun(run, "skipped"); return { ...run, status: "skipped" }; }
        cursor += 1;
      } else if (step.type === "branch") {
        const matched = evaluateConditionGroup(step.conditions, context);
        await logStep(currentRun, step, "completed", { matched, branch: matched ? "then" : "else" });
        plan = [...plan.slice(0, cursor), ...(matched ? step.then || [] : step.else || []), ...plan.slice(cursor + 1)];
      } else if (step.type === "wait") {
        const { data: existing } = await supabaseAdmin.from("automation_waits").select("status,resume_at").eq("run_id", run.id).eq("step_id", step.id).maybeSingle();
        if (existing?.status === "completed") { cursor += 1; continue; }
        const resumeAt = existing?.resume_at || calculateWaitResumeAt(step, {
          now: context.now,
          timeZone: context.clinic?.timezone || context.clinic?.metadata?.timezone || "America/Bahia",
        });
        const { error } = await supabaseAdmin.from("automation_waits").upsert({ clinica_id: run.clinica_id, run_id: run.id, step_id: step.id, resume_at: resumeAt, status: "pending" }, { onConflict: "run_id,step_id" });
        if (error) throw error;
        await logStep(currentRun, step, "waiting", { resume_at: resumeAt });
        await supabaseAdmin.from("automation_runs").update({ status: "waiting", current_step_index: cursor, execution_plan: plan, locked_at: null, locked_by: null, updated_at: new Date().toISOString() }).eq("id", run.id);
        return { ...run, status: "waiting" };
      } else if (step.type === "action") {
        await logStep(currentRun, step, "running");
        const result = await executeRegisteredAction({ run: currentRun, step, context });
        if (["blocked", "unavailable", "configuration_required"].includes(result.status)) {
          await logStep(currentRun, step, result.status === "unavailable" ? "unavailable" : "blocked", result);
          await finishRun(run, "failed", { code: result.reason || "ACTION_BLOCKED", message: result.message || "Ação bloqueada." });
          return { ...run, status: "failed" };
        }
        await logStep(currentRun, step, "completed", result);
        cursor += 1;
      } else throw Object.assign(new Error(`Etapa não suportada: ${step.type}`), { code: "STEP_NOT_SUPPORTED", permanent: true });
      const { error } = await supabaseAdmin.from("automation_runs").update({ status: "running", current_step_index: cursor, execution_plan: plan, updated_at: new Date().toISOString() }).eq("id", run.id);
      if (error) throw error;
    }
    await finishRun(run, "completed");
    return { ...run, status: "completed" };
  } catch (error) {
    const step = plan[cursor];
    if (step) await logStep({ ...run, current_step_index: cursor }, step, "failed", {}, safeError(error)).catch(() => {});
    await queueRetry(run, error, limits);
    return { ...run, status: error?.permanent ? "failed" : "queued" };
  }
}

async function startRun({ event, automation, version, context, depth }) {
  const matched = evaluateConditionGroup(version.definition.conditions, context);
  if (!matched) {
    await supabaseAdmin.from("automation_event_consumptions").upsert({ clinica_id: event.clinica_id, source_event_id: event.id, automation_id: automation.id, automation_version_id: version.id, status: "skipped", reason: "TRIGGER_CONDITIONS_FALSE" }, { onConflict: "clinica_id,source_event_id,automation_version_id" });
    return null;
  }
  const { data: run, error } = await supabaseAdmin.from("automation_runs").insert({ clinica_id: event.clinica_id, automation_id: automation.id, automation_version_id: version.id, source_event_id: event.id, source_event_type: event.type, entity_type: event.subject.type, entity_id: event.subject.id, status: "queued", execution_plan: version.definition.steps || [], context_snapshot: { event, clinic_metadata: context.clinic?.metadata || {} }, correlation_id: event.correlation_id, causation_id: event.causation_id, automation_depth: depth }).select("*").single();
  if (error) {
    if (error.code === "23505") return null;
    throw error;
  }
  await supabaseAdmin.from("automation_event_consumptions").upsert({ clinica_id: event.clinica_id, source_event_id: event.id, automation_id: automation.id, automation_version_id: version.id, run_id: run.id, status: "created" }, { onConflict: "clinica_id,source_event_id,automation_version_id" });
  await logStep({ ...run, current_step_index: 0, attempts: 1 }, { id: "trigger", type: "trigger" }, "completed", { event_type: event.type });
  await auditAutomation({ clinicId: event.clinica_id, action: "automation.run.started", entityType: "automation_run", entityId: run.id, metadata: { automation_id: automation.id, source_event_type: event.type } });
  // A execução começa somente depois do claim transacional. Isso evita que o
  // mesmo run seja iniciado em paralelo entre o consumidor do evento e o
  // processador de runs.
  return run;
}

export async function processAutomationOutboxEvent(row) {
  const event = normalizeAutomationEvent(row);
  const { data: automations, error } = await supabaseAdmin.from("automations").select("id,current_version_id,trigger_type,draft_definition,metadata").eq("clinica_id", event.clinica_id).eq("status", "active").eq("trigger_type", event.type).not("current_version_id", "is", null);
  if (error) throw error;
  if (!automations?.length) return { matched: 0 };
  const context = await resolveAutomationContext(event);
  const limits = resolveAutomationLimits(context.clinic?.metadata || {});
  let monthlyRuns = 0;
  if (limits.maxMonthlyRuns !== null) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { count, error: countError } = await supabaseAdmin.from("automation_runs").select("id", { count: "exact", head: true }).eq("clinica_id", event.clinica_id).gte("created_at", monthStart.toISOString());
    if (countError) throw countError;
    monthlyRuns = Number(count || 0);
  }
  let matched = 0;
  for (const automation of automations) {
    const { data: version, error: versionError } = await supabaseAdmin.from("automation_versions").select("id,definition,version").eq("clinica_id", event.clinica_id).eq("id", automation.current_version_id).single();
    if (versionError) throw versionError;
    if (limits.maxMonthlyRuns !== null && monthlyRuns >= limits.maxMonthlyRuns) {
      await supabaseAdmin.from("automation_event_consumptions").upsert({ clinica_id: event.clinica_id, source_event_id: event.id, automation_id: automation.id, automation_version_id: version.id, status: "skipped", reason: "PLAN_MONTHLY_RUN_LIMIT" }, { onConflict: "clinica_id,source_event_id,automation_version_id" });
      continue;
    }
    const guard = evaluateLoopGuard({ event, automationId: automation.id, reentry: version.definition?.trigger?.reentry, limits });
    if (!guard.allowed) {
      await supabaseAdmin.from("automation_event_consumptions").upsert({ clinica_id: event.clinica_id, source_event_id: event.id, automation_id: automation.id, automation_version_id: version.id, status: "loop_blocked", reason: guard.code }, { onConflict: "clinica_id,source_event_id,automation_version_id" });
      continue;
    }
    const started = await startRun({ event, automation, version, context, depth: guard.depth });
    if (started) { matched += 1; monthlyRuns += 1; }
  }
  return { matched };
}

export async function resumeAutomationWait(wait) {
  const { data: run, error } = await supabaseAdmin.from("automation_runs").select("*").eq("id", wait.run_id).eq("clinica_id", wait.clinica_id).single();
  if (error) throw error;
  if (run.status === "cancelled") {
    await supabaseAdmin.from("automation_waits").update({ status: "cancelled", completed_at: new Date().toISOString(), locked_at: null, locked_by: null }).eq("id", wait.id);
    return run;
  }
  await supabaseAdmin.from("automation_waits").update({ status: "completed", completed_at: new Date().toISOString(), locked_at: null, locked_by: null }).eq("id", wait.id);
  await supabaseAdmin.from("automation_runs").update({ status: "running", current_step_index: Number(run.current_step_index || 0) + 1, locked_at: null, locked_by: null, updated_at: new Date().toISOString() }).eq("id", run.id);
  return continueAutomationRun(run.id);
}
