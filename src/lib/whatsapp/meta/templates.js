export const TEMPLATE_CATALOG = Object.freeze({
  booking_created: { name: "nexawi_booking_created", category: "UTILITY" },
  booking_payment_pending: { name: "nexawi_booking_payment_pending", category: "UTILITY" },
  payment_expiring: { name: "nexawi_payment_expiring", category: "UTILITY" },
  payment_confirmed: { name: "nexawi_payment_confirmed", category: "UTILITY" },
  payment_expired: { name: "nexawi_payment_expired", category: "UTILITY" },
  appointment_reminder_24h: { name: "nexawi_appointment_reminder_24h", category: "UTILITY" },
  appointment_reminder_3h: { name: "nexawi_appointment_reminder_3h", category: "UTILITY" },
  booking_cancelled: { name: "nexawi_booking_cancelled", category: "UTILITY" },
  booking_rescheduled: { name: "nexawi_booking_rescheduled", category: "UTILITY" },
});

const TEMPLATE_COPY = Object.freeze({
  booking_created: "Olá, {{1}}. A {{2}} recebeu sua solicitação para {{3}} às {{4}}. Acompanhe as próximas atualizações por este WhatsApp.",
  booking_payment_pending: "Olá, {{1}}. Sua reserva na {{2}} para {{3}} às {{4}} aguarda o sinal de {{5}} até {{6}}. Pagamento: {{7}}",
  payment_expiring: "Olá, {{1}}. O prazo do sinal da sua reserva na {{2}}, marcada para {{3}} às {{4}}, está terminando. Valor: {{5}}. Prazo: {{6}}. Pagamento: {{7}}",
  payment_confirmed: "Olá, {{1}}. Pagamento confirmado pela {{2}}. Seu atendimento de {{3}} às {{4}} está garantido.",
  payment_expired: "Olá, {{1}}. O prazo de pagamento da reserva na {{2}}, prevista para {{3}} às {{4}}, expirou. Fale com a clínica para consultar uma nova disponibilidade.",
  appointment_reminder_24h: "Olá, {{1}}. A {{2}} lembra que seu atendimento está marcado para {{3}} às {{4}}. Confirme sua presença pelo botão.",
  appointment_reminder_3h: "Olá, {{1}}. Seu atendimento na {{2}} será hoje, {{3}}, às {{4}}. Confirme sua presença pelo botão.",
  booking_cancelled: "Olá, {{1}}. Seu atendimento na {{2}}, antes previsto para {{3}} às {{4}}, foi cancelado. Fale com a clínica se precisar de ajuda.",
  booking_rescheduled: "Olá, {{1}}. Seu atendimento na {{2}} foi remarcado para {{3}} às {{4}}.",
});

const BODY_EXAMPLES = Object.freeze({
  booking_created: [["Mariana", "Clínica Exemplo", "28/08/2026", "14:00"]],
  booking_payment_pending: [["Mariana", "Clínica Exemplo", "28/08/2026", "14:00", "R$ 50,00", "27/08/2026 às 18:00", "https://pagamento.exemplo.com/abc"]],
  payment_expiring: [["Mariana", "Clínica Exemplo", "28/08/2026", "14:00", "R$ 50,00", "27/08/2026 às 18:00", "https://pagamento.exemplo.com/abc"]],
  payment_confirmed: [["Mariana", "Clínica Exemplo", "28/08/2026", "14:00"]],
  payment_expired: [["Mariana", "Clínica Exemplo", "28/08/2026", "14:00"]],
  appointment_reminder_24h: [["Mariana", "Clínica Exemplo", "28/08/2026", "14:00"]],
  appointment_reminder_3h: [["Mariana", "Clínica Exemplo", "28/08/2026", "14:00"]],
  booking_cancelled: [["Mariana", "Clínica Exemplo", "28/08/2026", "14:00"]],
  booking_rescheduled: [["Mariana", "Clínica Exemplo", "29/08/2026", "15:30"]],
});

export function buildTemplateSubmission(purpose) {
  const catalog = TEMPLATE_CATALOG[purpose];
  const body = TEMPLATE_COPY[purpose];
  if (!catalog || !body) throw new Error("Finalidade de template desconhecida.");
  const components = [{ type: "BODY", text: body, example: { body_text: BODY_EXAMPLES[purpose] } }];
  if (["appointment_reminder_24h", "appointment_reminder_3h"].includes(purpose)) {
    components.push({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Confirmar presença" }] });
  }
  return { name: catalog.name, language: "pt_BR", category: catalog.category, components };
}
const parameter = (value) => ({ type: "text", text: String(value ?? "-").slice(0, 1024) });
export function buildTemplateMessage({ to, template, variables = [], buttonUrlSuffix = null, quickReplyPayload = null }) {
  if (!to || !template?.name || template.status !== "APPROVED") throw new Error("Template aprovado e destinatário são obrigatórios.");
  const components = variables.length ? [{ type: "body", parameters: variables.map(parameter) }] : [];
  if (buttonUrlSuffix) components.push({ type: "button", sub_type: "url", index: "0", parameters: [parameter(buttonUrlSuffix)] });
  if (quickReplyPayload) components.push({ type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: String(quickReplyPayload).slice(0, 256) }] });
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type: "template", template: { name: template.name, language: { code: template.language || "pt_BR" }, components } };
}
export function templatePurposeFromName(name) { return Object.entries(TEMPLATE_CATALOG).find(([, v]) => v.name === name)?.[0] || null; }
