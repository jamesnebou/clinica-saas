const parameter = (name, label, type, required = false, extra = {}) => Object.freeze({ name, label, type, required, ...extra });

export const ACTION_REGISTRY = Object.freeze({
  "crm.create_activity": { type: "crm.create_activity", label: "Criar atividade", module: "CRM", capability: "crm", risk: "LOW", parameters: [parameter("title", "Título", "string", true), parameter("activity_type", "Tipo", "enum", false, { options: ["follow_up", "tarefa", "ligacao", "whatsapp", "email"] }), parameter("description", "Descrição", "string"), parameter("due_in_minutes", "Prazo em minutos", "number")] },
  "crm.create_follow_up": { type: "crm.create_follow_up", label: "Criar follow-up", module: "CRM", capability: "crm", risk: "LOW", parameters: [parameter("title", "Título", "string", true), parameter("description", "Descrição", "string"), parameter("due_in_minutes", "Prazo em minutos", "number")] },
  "crm.assign_owner": { type: "crm.assign_owner", label: "Alterar responsável", module: "CRM", capability: "crm", risk: "MEDIUM", parameters: [parameter("owner_id", "Responsável", "reference", true)] },
  "crm.add_tag": { type: "crm.add_tag", label: "Adicionar tag", module: "CRM", capability: "crm", risk: "LOW", parameters: [parameter("tag_id", "Tag", "reference", true)] },
  "crm.remove_tag": { type: "crm.remove_tag", label: "Remover tag", module: "CRM", capability: "crm", risk: "LOW", parameters: [parameter("tag_id", "Tag", "reference", true)] },
  "crm.move_stage": { type: "crm.move_stage", label: "Mover para etapa", module: "CRM", capability: "crm", risk: "MEDIUM", parameters: [parameter("stage_id", "Etapa", "reference", true)] },
  "agenda.register_reminder": { type: "agenda.register_reminder", label: "Registrar lembrete", module: "Agenda", capability: "agenda", risk: "LOW", parameters: [parameter("channel", "Canal", "enum", false, { options: ["interno", "email", "whatsapp"] }), parameter("message", "Mensagem", "string")] },
  "agenda.update_status": { type: "agenda.update_status", label: "Atualizar status do agendamento", module: "Agenda", capability: "agenda", risk: "HIGH", parameters: [parameter("status", "Status", "enum", true, { options: ["agendado", "confirmado", "concluido", "faltou", "cancelado"] })] },
  "finance.create_receivable": { type: "finance.create_receivable", label: "Criar recebível", module: "Financeiro", capability: "financeiro", risk: "HIGH", parameters: [parameter("description", "Descrição", "string", true), parameter("amount", "Valor", "money", true), parameter("due_date", "Vencimento", "date", true), parameter("category_id", "Categoria", "reference", true), parameter("cost_center_id", "Centro de custo", "reference", true)] },
  "finance.create_collection_task": { type: "finance.create_collection_task", label: "Criar tarefa de cobrança", module: "Financeiro", capability: "financeiro", risk: "LOW", parameters: [parameter("title", "Título", "string", true), parameter("due_in_minutes", "Prazo em minutos", "number")] },
  "communication.send_email": { type: "communication.send_email", label: "Enviar e-mail", module: "Comunicação", capability: "integracoes", risk: "MEDIUM", parameters: [parameter("subject", "Assunto", "string", true), parameter("message", "Mensagem", "string", true)] },
  "communication.send_whatsapp": { type: "communication.send_whatsapp", label: "Enviar WhatsApp", module: "Comunicação", capability: "whatsapp", risk: "MEDIUM", parameters: [parameter("template_purpose", "Template oficial", "string", true)] },
  "internal.create_notification": { type: "internal.create_notification", label: "Criar notificação interna", module: "Sistema", capability: "automacoes", risk: "LOW", parameters: [parameter("title", "Título", "string", true), parameter("message", "Mensagem", "string", true)] },
});

export const ACTION_TYPES = Object.freeze(Object.keys(ACTION_REGISTRY));
export function getActionDefinition(type) { return ACTION_REGISTRY[type] || null; }
export function isRegisteredAction(type) { return Boolean(getActionDefinition(type)); }
export function validateActionParameters(type, params = {}) {
  const definition = getActionDefinition(type);
  if (!definition) return [`Ação não registrada: ${type || "vazia"}.`];
  return definition.parameters.filter((item) => item.required && (params[item.name] === undefined || params[item.name] === null || params[item.name] === "")).map((item) => `Informe ${item.label.toLowerCase()} na ação ${definition.label}.`);
}
