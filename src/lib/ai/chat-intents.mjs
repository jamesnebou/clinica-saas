import { z } from "zod";

export const chatIntentSchema = z.enum(["overview", "agenda", "agenda_details", "finance", "absences", "customers", "trends"]);
export const chatMemorySchema = z.strictObject({
  intent: chatIntentSchema,
  days: z.union([z.literal(7), z.literal(30)]),
  metric: z.string().max(40).nullable(),
  objective: z.enum(["analyze", "explain", "compare", "improve"]),
});
export const chatRequestSchema = z.strictObject({
  question: z.string().trim().min(2).max(400),
  days: z.union([z.literal(7), z.literal(30)]),
  lastIntent: chatIntentSchema.nullable().optional(),
  memory: chatMemorySchema.nullable().optional(),
  agendaContext: z.strictObject({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["agendado", "confirmado"]).nullable(),
    mode: z.enum(["list", "count", "first", "procedures"]),
  }).nullable().optional(),
  agendaPage: z.number().int().min(0).max(1000).optional(),
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

  const followUpRequested = /\b(?:explique|detalhe|aprofund\w*|mais\s+sobre|essa\s+tendencia|esse\s+resultado|por\s+que|porque|comparad\w*|periodo\s+anterior|melhorar|recomendacao)\b/.test(text);
  const temporal = /\b(?:hoje|amanha|dia\s+seguinte|\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/.test(text);
  const asksForRecords = /\b(?:quais|quem|mostr\w*|liste|listar|cada|primeir\w*|quantos|quantas)\b/.test(text);
  const bookingWords = /\b(?:agenda|agend\w*|atendimento\w*|horario\w*|procedimento\w*)\b/.test(text);
  if (temporal && /\bclientes?\b/.test(text) && !bookingWords && !/\b(?:quais|quem|mostr\w*|liste|listar)\b/.test(text)) {
    return { intent: null, followUp: false, message: "Ainda não consigo analisar clientes por dia. Posso consultar a agenda dessa data ou analisar clientes nos últimos 7 ou 30 dias." };
  }
  const agendaSubject = bookingWords || /\bclientes?\b/.test(text) && temporal;
  const contextualAgenda = /\b(?:quais\s+sao\s+(?:eles|elas|esses|essas)(?:\s+dois)?|quem\s+sao|(?:mostr\w*|liste|listar)\s+(?:apenas\s+|somente\s+)?(?:esses|essas|os\s+confirmados)|desses|dessas|deles|delas|algum|primeir\w*|amanha|hoje|dia\s+seguinte|confirmad\w*|procedimento\w*)\b/.test(text);
  const agendaFollowUp = lastIntent === "agenda_details" && contextualAgenda;
  if ((agendaSubject && (temporal || asksForRecords && /\b(?:agend\w*|atendimento\w*|horario\w*|procedimento\w*)\b/.test(text))) || agendaFollowUp) {
    return { intent: "agenda_details", followUp: agendaFollowUp, message: null };
  }
  if (/\b(?:quais\s+sao\s+(?:eles|elas|esses|essas)|quem\s+sao|desses|dessas|deles|delas|dia\s+seguinte)\b/.test(text) && !lastIntent) {
    return { intent: null, followUp: false, message: "A quais agendamentos você se refere? Informe a data ou o período para consultar a agenda." };
  }
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
  const selected = followUpRequested && lastIntent && (!intent || intent === "trends"
    || intent === "overview" && /\b(?:esse|essa|deste|dessa)\s+resultado\b/.test(text)) ? lastIntent : intent;
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

export function directChatMetrics(question, intent, metrics) {
  const text = normalize(question);
  if (!/\b(?:quanto|quantos|quantas|qual\s+(?:o|a)\s+(?:total|valor|numero|quantidade))\b/.test(text)
    || /\b(?:porque|por\s+que|explique|analise|compare|tendencia)\b/.test(text)) return null;
  if (intent === "finance") {
    const entry = /\b(?:entrada\w*|entr(?:ou|aram)|receita\w*|receb\w*|fatur\w*)\b/.test(text);
    const exit = /\b(?:saida\w*|sa(?:iu|iram)|despesa\w*)\b/.test(text);
    return metrics.filter((item) => (!entry && !exit) || entry && item.label === "Entradas realizadas" || exit && item.label === "Saídas realizadas");
  }
  if (intent === "agenda") {
    const label = /confirmad\w*/.test(text) ? "Confirmados" : /concluid\w*/.test(text) ? "Concluídos"
      : /proxim\w*/.test(text) ? "Próximos" : "Agendamentos";
    return metrics.filter((item) => item.label === label);
  }
  if (intent === "customers") return metrics.filter((item) => item.label === (/nov\w*/.test(text) ? "Novos no período" : "Clientes"));
  if (intent === "absences") {
    const absence = /falta\w*/.test(text);
    const canceled = /cancel\w*/.test(text);
    return metrics.filter((item) => (!absence && !canceled) || absence && item.label === "Faltas" || canceled && item.label === "Cancelamentos");
  }
  return null;
}
