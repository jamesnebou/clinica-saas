const UNSAFE_OUTPUT = "AI_UNSAFE_OUTPUT";
const EMAIL = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i;
const CPF = /\b(?:cpf\s*[:#-]?\s*)?(?:\d{3}[.\s-]?){3}\d{2}\b/i;
const PHONE = /\b(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/;
const PATIENT_NAME = /\b(?:[Pp]aciente|[Cc]liente)\s+[A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+)?(?![a-zà-ÿ])/u;

function normalize(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function hasClinicalAdvice(text) {
  const value = normalize(text);
  return /\b(?:diagnostic\w*|prescrev\w*|prescri\w*|posologia|dosagem|medicamento\w*|remedio\w*)\b/.test(value)
    || /\b(?:paciente|cliente)\b.{0,80}\b(?:diabetes|hipertensao|cancer|lesao|infeccao|doenca|patologia|tratamento individual)\b/.test(value)
    || /\b(?:tem|apresenta|sofre de|portador de)\b.{0,45}\b(?:diabetes|hipertensao|cancer|lesao|infeccao|doenca|patologia)\b/.test(value)
    || /\b(?:aplique|aplicar|tome|tomar|indique|usar|administre|administrar|ingerir)\b.{0,60}\b(?:botox|injecao|antibiotico|dose|terapia|dipirona|paracetamol|\d+(?:[.,]\d+)?\s*(?:mg|ml))\b/.test(value);
}

function parseMoney(value) {
  if (value.includes(",")) return Number(value.replace(/\./g, "").replace(",", "."));
  if (/\.\d{2}$/.test(value)) return Number(value);
  return Number(value.replace(/\./g, ""));
}

function contradictsKnownMetric(text, payload) {
  const value = normalize(text);
  const moneyClaims = /\b(receita realizada|entradas realizadas|recebimentos realizados|despesas realizadas|saidas realizadas)\s+(?:de|foi|foram|totalizaram|somaram|atingiu)\s+r\$\s*([\d.,]+)/g;
  for (const match of value.matchAll(moneyClaims)) {
    const expected = /receita|entradas|recebimentos/.test(match[1]) ? payload.finance.realizedEntries : payload.finance.realizedExits;
    if (Math.abs(parseMoney(match[2]) - expected) > 0.005) return true;
  }
  const reverseMoneyClaims = /r\$\s*([\d.,]+)\s+(?:de|em)\s+(receita realizada|entradas realizadas|recebimentos realizados|despesas realizadas|saidas realizadas)\b/g;
  for (const match of value.matchAll(reverseMoneyClaims)) {
    const expected = /receita|entradas|recebimentos/.test(match[2]) ? payload.finance.realizedEntries : payload.finance.realizedExits;
    if (Math.abs(parseMoney(match[1]) - expected) > 0.005) return true;
  }
  const countClaims = /\b(?:houve|ha|foram|registrados?|total de)\s+(\d+)\s+(agendamentos?|faltas?|cancelamentos?)\b/g;
  for (const match of value.matchAll(countClaims)) {
    const expected = match[2].startsWith("agendamento") ? payload.agenda.total
      : match[2].startsWith("falta") ? payload.agenda.noShows : payload.agenda.canceled;
    if (Number(match[1]) !== expected) return true;
  }
  const labeledCounts = /\b(agendamentos|faltas|cancelamentos)\s*[:=]\s*(\d+)\b/g;
  for (const match of value.matchAll(labeledCounts)) {
    const expected = match[1] === "agendamentos" ? payload.agenda.total
      : match[1] === "faltas" ? payload.agenda.noShows : payload.agenda.canceled;
    if (Number(match[2]) !== expected) return true;
  }
  const noShowRate = /\btaxa de faltas\s*(?:foi|e|de|:)?\s*(\d+(?:[.,]\d+)?)\s*%/g;
  for (const match of value.matchAll(noShowRate)) {
    if (payload.trends.noShowRatePercent === null || Math.abs(Number(match[1].replace(",", ".")) - payload.trends.noShowRatePercent) > 0.05) return true;
  }
  return false;
}

export function assertClinicSummaryOutputSafe(output, payload) {
  const texts = [output.title, output.executiveSummary,
    ...output.highlights.flatMap(({ title, detail }) => [title, detail]),
    ...output.alerts.flatMap(({ title, detail }) => [title, detail]),
    ...output.opportunities.flatMap(({ title, detail }) => [title, detail]),
    ...output.recommendedActions.flatMap(({ action, rationale }) => [action, rationale])];
  for (const text of texts) {
    if (EMAIL.test(text) || CPF.test(text) || PHONE.test(text) || PATIENT_NAME.test(text)
      || hasClinicalAdvice(text) || contradictsKnownMetric(text, payload)) throw new Error(UNSAFE_OUTPUT);
  }
}
