export const AUTOMATION_OPERATIONS = Object.freeze(["view", "manage", "publish", "runs", "export"]);

const ROLE_OPERATIONS = Object.freeze({
  owner: AUTOMATION_OPERATIONS,
  admin: AUTOMATION_OPERATIONS,
  recepcao: Object.freeze(["view", "runs"]),
  financeiro: Object.freeze(["view", "runs", "export"]),
  profissional: Object.freeze(["view"]),
});

export function canPerformAutomationOperation(role, operation) {
  return AUTOMATION_OPERATIONS.includes(operation) && Boolean(ROLE_OPERATIONS[role]?.includes(operation));
}

export function assertAutomationOperation(role, operation) {
  if (!canPerformAutomationOperation(role, operation)) {
    const error = new Error("Você não tem permissão para executar esta operação de automação.");
    error.code = "AUTOMATION_PERMISSION_DENIED";
    throw error;
  }
}
