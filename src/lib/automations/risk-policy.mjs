export const HIGH_RISK_AUTOMATION_ACTIONS = Object.freeze([
  "agenda.update_status",
  "finance.create_receivable",
]);

export function isHighRiskAutomationAction(actionType) {
  return HIGH_RISK_AUTOMATION_ACTIONS.includes(actionType);
}

export function canExecuteAutomationAction(actionType, allowHighRisk = false) {
  return !isHighRiskAutomationAction(actionType) || allowHighRisk === true;
}
