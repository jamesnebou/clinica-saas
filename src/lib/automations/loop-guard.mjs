import { DEFAULT_AUTOMATION_LIMITS } from "./limits.mjs";

export function evaluateLoopGuard({ event, automationId, reentry = "deny_self", limits = DEFAULT_AUTOMATION_LIMITS }) {
  const depth = Number(event?.automation_depth || event?.payload?.automation_depth || 0);
  if (depth >= limits.maxAutomationDepth) return { allowed: false, code: "MAX_AUTOMATION_DEPTH", depth };
  const causedBy = event?.automation_id || event?.payload?.automation_id || null;
  if (reentry !== "allow" && causedBy && causedBy === automationId) return { allowed: false, code: "SELF_REENTRY_BLOCKED", depth };
  return { allowed: true, depth: depth + 1 };
}

export function buildCausationMetadata({ event, automationId, runId, depth }) {
  return { correlation_id: event.correlation_id || event.id, causation_id: event.id, automation_id: automationId, automation_run_id: runId, automation_depth: depth };
}
