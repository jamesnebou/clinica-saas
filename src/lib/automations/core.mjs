export const AUTOMATION_DEFINITION_VERSION = 1;
export const AUTOMATION_STATUSES = Object.freeze(["draft", "active", "paused", "archived"]);
export const RUN_STATUSES = Object.freeze(["queued", "running", "waiting", "completed", "failed", "cancelled", "skipped"]);
export const STEP_STATUSES = Object.freeze(["pending", "running", "waiting", "completed", "failed", "cancelled", "skipped", "blocked"]);

export function createEmptyConditionGroup() {
  return { kind: "group", operator: "AND", conditions: [] };
}

export function createEmptyDefinition(triggerType = "") {
  return { schemaVersion: AUTOMATION_DEFINITION_VERSION, trigger: { type: triggerType, reentry: "deny_self" }, conditions: createEmptyConditionGroup(), steps: [] };
}

export function normalizeDefinition(input = {}) {
  const definition = typeof input === "string" ? JSON.parse(input) : structuredClone(input || {});
  return {
    schemaVersion: Number(definition.schemaVersion || AUTOMATION_DEFINITION_VERSION),
    trigger: { type: String(definition.trigger?.type || ""), reentry: definition.trigger?.reentry === "allow" ? "allow" : "deny_self" },
    conditions: normalizeGroup(definition.conditions),
    steps: normalizeSteps(definition.steps),
  };
}

function normalizeGroup(group) {
  return {
    kind: "group",
    operator: String(group?.operator || "AND").toUpperCase() === "OR" ? "OR" : "AND",
    conditions: Array.isArray(group?.conditions) ? group.conditions.map((condition) => condition?.kind === "group" ? normalizeGroup(condition) : ({ kind: "predicate", field: String(condition?.field || ""), operator: String(condition?.operator || "equals"), valueType: String(condition?.valueType || "string"), value: condition?.value ?? null })) : [],
  };
}

function normalizeSteps(steps) {
  return Array.isArray(steps) ? steps.map((step, index) => {
    const base = { id: String(step?.id || `step_${index + 1}`), type: String(step?.type || "action") };
    if (base.type === "action") return { ...base, actionType: String(step?.actionType || ""), params: typeof step?.params === "object" && step.params ? step.params : {} };
    if (base.type === "wait") return { ...base, mode: step?.mode === "until" ? "until" : "duration", amount: Number(step?.amount || 0), unit: ["minutes", "hours", "days"].includes(step?.unit) ? step.unit : "minutes", until: step?.until || null };
    if (base.type === "condition") return { ...base, conditions: normalizeGroup(step?.conditions) };
    if (base.type === "branch") return { ...base, conditions: normalizeGroup(step?.conditions), then: normalizeSteps(step?.then), else: normalizeSteps(step?.else) };
    return base;
  }) : [];
}

export function countDefinitionNodes(definition) {
  let steps = 0; let waits = 0; let conditions = 0; let maxConditionDepth = 0;
  const walkGroup = (group, depth = 1) => { maxConditionDepth = Math.max(maxConditionDepth, depth); for (const item of group?.conditions || []) { if (item.kind === "group") walkGroup(item, depth + 1); else conditions += 1; } };
  const walkSteps = (items) => { for (const step of items || []) { steps += 1; if (step.type === "wait") waits += 1; if (step.type === "condition" || step.type === "branch") walkGroup(step.conditions); if (step.type === "branch") { walkSteps(step.then); walkSteps(step.else); } } };
  walkGroup(definition.conditions); walkSteps(definition.steps);
  return { steps, waits, conditions, maxConditionDepth };
}

export function deterministicActionKey(runId, stepId) { return `automation:${runId}:step:${stepId}`; }
