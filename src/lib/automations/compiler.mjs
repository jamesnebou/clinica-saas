import { evaluateConditionGroup } from "./conditions.mjs";
import { validateAutomationDefinition } from "./validation.mjs";

export function compileAutomationDefinition(input, options = {}) {
  const validation = validateAutomationDefinition(input, options);
  if (!validation.valid) throw Object.assign(new Error("Automação inválida."), { code: "AUTOMATION_INVALID", details: validation.errors });
  return Object.freeze({ definition: validation.definition, triggerType: validation.definition.trigger.type, executeTriggerConditions: (context) => evaluateConditionGroup(validation.definition.conditions, context) });
}

export function dryRunAutomation(input, context, options = {}) {
  const compiled = compileAutomationDefinition(input, options);
  const timeline = [{ type: "trigger", status: "completed", message: `Evento ${compiled.triggerType} reconhecido.` }];
  const triggerMatches = compiled.executeTriggerConditions(context);
  timeline.push({ type: "condition", status: triggerMatches ? "completed" : "skipped", message: triggerMatches ? "Condições iniciais atendidas." : "Condições iniciais não atendidas." });
  if (!triggerMatches) return { matched: false, timeline };
  const walk = (steps) => { for (const step of steps || []) { if (step.type === "wait") timeline.push({ stepId: step.id, type: "wait", status: "skipped", message: "Espera calculada, mas não executada no modo de teste." }); else if (step.type === "condition") { const result = evaluateConditionGroup(step.conditions, context); timeline.push({ stepId: step.id, type: "condition", status: result ? "completed" : "skipped", message: result ? "Condição seria atendida." : "Condição não seria atendida." }); if (!result) break; } else if (step.type === "branch") { const result = evaluateConditionGroup(step.conditions, context); timeline.push({ stepId: step.id, type: "branch", status: "completed", message: result ? "Ramo verdadeiro seria executado." : "Ramo alternativo seria executado." }); walk(result ? step.then : step.else); } else timeline.push({ stepId: step.id, type: "action", actionType: step.actionType, status: "skipped", message: `A ação ${step.actionType} seria executada sem efeitos colaterais.` }); } };
  walk(compiled.definition.steps);
  return { matched: true, timeline };
}
