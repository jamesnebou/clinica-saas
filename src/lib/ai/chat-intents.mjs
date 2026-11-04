import { z } from "zod";

export const chatIntentSchema = z.enum(["overview", "agenda", "finance", "absences", "customers", "trends"]);
export const chatRequestSchema = z.strictObject({
  question: z.string().trim().min(2).max(400),
  days: z.union([z.literal(7), z.literal(30)]),
  lastIntent: chatIntentSchema.nullable().optional(),
});

const AVAILABLE = "Posso ajudar com visão geral, agenda, entradas e saídas financeiras, faltas e cancelamentos, clientes e tendências dos últimos 7 ou 30 dias.";
const SENSITIVE = "Para proteger dados pessoais e clínicos, pergunte somente sobre indicadores agregados da clínica.";

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function classifyManagementQuestion(question, lastIntent = null) {
  const text = normalize(question);
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(question)
    || /\b(?:\d{3}[.\s-]?){3}\d{2}\b/.test(question)
    || /\b(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/.test(question)
    || /\b(?:paciente|prontuario|diagnostic\w*|sintoma\w*|medicamento\w*|tratamento\s+individual|exame\s+clinico)\b/.test(text)) {
    return { intent: null, followUp: false, message: SENSITIVE };
  }

  const followUpRequested = /\b(?:explique|detalhe|aprofund\w*|mais\s+sobre|essa\s+tendencia|esse\s+resultado)\b/.test(text);
  const rules = [
    ["absences", /\b(?:falta\w*|cancel\w*|nao\s+comparec\w*|no[ -]?show)\b/],
    ["finance", /\b(?:financ\w*|receita\w*|despesa\w*|entrada\w*|saida\w*|entr(?:ou|aram|ando)|sa(?:iu|iram|indo)|receb\w*|pagamento\w*|fatur\w*|dinheiro|lucro)\b/],
    ["agenda", /\b(?:agenda|agend\w*|atendimento\w*|horario\w*)\b/],
    ["customers", /\b(?:cliente\w*|crescimento\s+de\s+cliente\w*|novos\s+clientes)\b/],
    ["trends", /\b(?:tendencia\w*|compar\w*|evolu\w*|crescimento|queda\w*)\b/],
    ["overview", /\b(?:geral|desempenho|resultado\w*|resumo|visao|clinica)\b/],
  ];
  const intent = rules.find(([, pattern]) => pattern.test(text))?.[0] || null;
  if (followUpRequested && !intent && !lastIntent) return { intent: null, followUp: false, message: "Escolha primeiro um assunto de gestão. " + AVAILABLE };
  const selected = followUpRequested && lastIntent && (!intent || intent === "trends") ? lastIntent : intent;
  return selected ? { intent: selected, followUp: followUpRequested && Boolean(lastIntent) && selected === lastIntent, message: null }
    : { intent: null, followUp: false, message: AVAILABLE };
}

export function confirmedChatMetrics(payload, intent) {
  const metric = (label, value, kind = "count") => ({ label, value, kind });
  const agenda = [metric("Agendamentos", payload.agenda.total), metric("Concluídos", payload.agenda.completed),
    metric("Confirmados", payload.agenda.confirmed), metric("Próximos", payload.agenda.upcoming)];
  const finance = [metric("Entradas realizadas", payload.finance.realizedEntries, "currency"),
    metric("Saídas realizadas", payload.finance.realizedExits, "currency")];
  const absences = [metric("Faltas", payload.agenda.noShows), metric("Cancelamentos", payload.agenda.canceled)];
  if (payload.trends.noShowRatePercent !== null) absences.push(metric("Taxa de faltas", payload.trends.noShowRatePercent, "percent"));
  const customers = [metric("Clientes", payload.customers.total), metric("Novos no período", payload.customers.newInPeriod)];
  const trends = [];
  if (payload.trends.appointmentsPercent !== null) trends.push(metric("Variação de agendamentos", payload.trends.appointmentsPercent, "percent"));
  if (payload.trends.receivedPercent !== null) trends.push(metric("Variação de entradas", payload.trends.receivedPercent, "percent"));
  return ({ overview: [...agenda.slice(0, 1), ...finance, ...customers.slice(1)], agenda, finance, absences, customers, trends })[intent];
}
