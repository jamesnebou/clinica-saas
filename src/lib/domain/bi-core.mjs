function finite(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function compareMetric(currentValue, previousValue) {
  const current = finite(currentValue);
  const previous = finite(previousValue);
  const absolute = current - previous;
  const percentage = previous === 0 ? (current === 0 ? 0 : null) : (absolute / Math.abs(previous)) * 100;
  return { current, previous, absolute, percentage };
}

export function percentage(numerator, denominator) {
  const total = finite(denominator);
  return total > 0 ? (finite(numerator) / total) * 100 : 0;
}

export function retentionRate(records = [], days = 30) {
  const byClient = new Map();
  for (const record of records) {
    if (!record?.cliente_id || !record?.inicio) continue;
    const date = new Date(record.inicio);
    if (Number.isNaN(date.getTime())) continue;
    if (!byClient.has(record.cliente_id)) byClient.set(record.cliente_id, []);
    byClient.get(record.cliente_id).push(date.getTime());
  }
  let eligible = 0;
  let retained = 0;
  const limit = days * 86400000;
  for (const visits of byClient.values()) {
    visits.sort((a, b) => a - b);
    if (visits.length < 2) continue;
    eligible += 1;
    if (visits.some((visit, index) => index > 0 && visit - visits[index - 1] <= limit)) retained += 1;
  }
  return { eligible, retained, rate: percentage(retained, eligible) };
}

export function buildDeterministicInsights(current = {}, previous = {}) {
  const definitions = [
    { key: "recebido", title: "Receita recebida", adverse: "down", threshold: 15, action: "Revisar agenda, conversão e recebimentos do período." },
    { key: "taxa_no_show", title: "No-show", adverse: "up", threshold: 20, action: "Analisar confirmações e lembretes dos próximos atendimentos." },
    { key: "taxa_cancelamento", title: "Cancelamentos", adverse: "up", threshold: 20, action: "Revisar motivos de cancelamento e política de reserva." },
    { key: "taxa_conversao", title: "Conversão comercial", adverse: "down", threshold: 15, action: "Priorizar follow-ups vencidos e origens com maior potencial." },
  ];
  return definitions.flatMap((definition) => {
    const comparison = compareMetric(current[definition.key], previous[definition.key]);
    if (comparison.percentage === null) return [];
    const adverse = definition.adverse === "up" ? comparison.percentage >= definition.threshold : comparison.percentage <= -definition.threshold;
    if (!adverse) return [];
    return [{ type: definition.key, severity: Math.abs(comparison.percentage) >= 30 ? "high" : "medium", title: `${definition.title} exige atenção`, description: `${definition.title} variou ${Math.abs(comparison.percentage).toFixed(1)}% em relação ao período anterior.`, metric: definition.key, currentValue: comparison.current, previousValue: comparison.previous, suggestedAction: definition.action, href: "/dashboard/bi" }];
  });
}

export function appointmentRates(records = []) {
  const total = records.length;
  const count = (status) => records.filter((item) => item?.status === status).length;
  return {
    total,
    concluded: count("concluido"),
    noShow: count("faltou"),
    cancelled: count("cancelado"),
    conclusionRate: percentage(count("concluido"), total),
    noShowRate: percentage(count("faltou"), total),
    cancellationRate: percentage(count("cancelado"), total),
  };
}

export function crmConversion(records = []) {
  const leads = records.length;
  const converted = records.filter((item) => item?.status === "convertido").length;
  return { leads, converted, rate: percentage(converted, leads) };
}

export function revenueRanking(records = [], groupKey) {
  const groups = new Map();
  for (const record of records) {
    if (["cancelado", "faltou"].includes(record?.status) || record?.pagamento_status === "cancelado") continue;
    const key = record?.[groupKey] || "sem_identificacao";
    const current = groups.get(key) || { id: key, quantity: 0, expected: 0, received: 0 };
    current.quantity += 1;
    current.expected += finite(record?.valor);
    current.received += finite(record?.valor_pago);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.received - a.received);
}
