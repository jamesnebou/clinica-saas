import { countDefinitionNodes, normalizeDefinition } from "./core.mjs";
import { DEFAULT_AUTOMATION_LIMITS } from "./limits.mjs";
import { getActionDefinition, validateActionParameters } from "./registry/actions.mjs";
import { getEventDefinition, getEventField } from "./registry/events.mjs";
import { getOperator, operatorSupportsType } from "./registry/operators.mjs";

function validateGroup(group, eventType, errors, path = "conditions") {
  if (!group || !["AND", "OR"].includes(group.operator)) errors.push(`${path}: grupo inválido.`);
  for (const [index, condition] of (group?.conditions || []).entries()) {
    const current = `${path}.${index}`;
    if (condition.kind === "group") { validateGroup(condition, eventType, errors, current); continue; }
    const eventField = getEventField(eventType, condition.field);
    if (!eventField) errors.push(`${current}: campo não permitido para este evento.`);
    if (!getOperator(condition.operator)) errors.push(`${current}: operador não registrado.`);
    else if (eventField && !operatorSupportsType(condition.operator, eventField.type)) errors.push(`${current}: operador incompatível com ${eventField.type}.`);
    if (!["is_empty", "is_not_empty"].includes(condition.operator) && condition.value === undefined) errors.push(`${current}: informe um valor.`);
  }
}

function validateSteps(steps, eventType, errors, path = "steps", capabilities = null) {
  const ids = new Set();
  for (const [index, step] of steps.entries()) {
    const current = `${path}.${index}`;
    if (!step.id || ids.has(step.id)) errors.push(`${current}: identificador de etapa ausente ou duplicado.`); else ids.add(step.id);
    if (step.type === "action") {
      const action = getActionDefinition(step.actionType);
      errors.push(...validateActionParameters(step.actionType, step.params).map((message) => `${current}: ${message}`));
      if (action && capabilities && !capabilities.includes(action.capability)) errors.push(`${current}: a capability ${action.capability} não está disponível.`);
    } else if (step.type === "wait") {
      if (step.mode === "duration" && (!(step.amount > 0) || !["minutes", "hours", "days"].includes(step.unit))) errors.push(`${current}: espera inválida.`);
      if (step.mode === "until" && !step.until) errors.push(`${current}: horário de retomada obrigatório.`);
    } else if (step.type === "condition") validateGroup(step.conditions, eventType, errors, `${current}.conditions`);
    else if (step.type === "branch") { validateGroup(step.conditions, eventType, errors, `${current}.conditions`); validateSteps(step.then || [], eventType, errors, `${current}.then`, capabilities); validateSteps(step.else || [], eventType, errors, `${current}.else`, capabilities); }
    else errors.push(`${current}: tipo de etapa não suportado.`);
  }
}

export function validateAutomationDefinition(input, options = {}) {
  const limits = { ...DEFAULT_AUTOMATION_LIMITS, ...(options.limits || {}) };
  const errors = [];
  let definition;
  try { definition = normalizeDefinition(input); } catch { return { valid: false, errors: ["A definição não contém JSON válido."], definition: null }; }
  const bytes = new TextEncoder().encode(JSON.stringify(definition)).length;
  if (bytes > limits.maxDefinitionBytes) errors.push("A definição excede o tamanho permitido.");
  const event = getEventDefinition(definition.trigger.type);
  if (!event) errors.push("Selecione um evento registrado.");
  else if (options.capabilities && !options.capabilities.includes(event.capability)) errors.push(`A capability ${event.capability} não está disponível.`);
  validateGroup(definition.conditions, definition.trigger.type, errors);
  validateSteps(definition.steps, definition.trigger.type, errors, "steps", options.capabilities || null);
  const counts = countDefinitionNodes(definition);
  if (counts.steps === 0) errors.push("Adicione pelo menos uma etapa.");
  if (counts.steps > limits.maxSteps) errors.push(`Limite de ${limits.maxSteps} etapas excedido.`);
  if (counts.waits > limits.maxWaits) errors.push(`Limite de ${limits.maxWaits} esperas excedido.`);
  if (counts.conditions > limits.maxConditions) errors.push(`Limite de ${limits.maxConditions} condições excedido.`);
  if (counts.maxConditionDepth > limits.maxConditionDepth) errors.push(`Profundidade máxima de condições excedida.`);
  return { valid: errors.length === 0, errors, definition, counts, bytes };
}

export function validateReferenceShape(actionType, params = {}) {
  const action = getActionDefinition(actionType);
  if (!action) return false;
  return action.parameters.filter((item) => item.type === "reference" && item.required).every((item) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(params[item.name] || "")));
}
