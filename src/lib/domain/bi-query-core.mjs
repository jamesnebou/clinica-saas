function optional(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function normalizeBIFilters(filters = {}) {
  return {
    profissional: optional(filters.profissional),
    procedimento: optional(filters.procedimento),
    categoria: optional(filters.categoria),
    status: optional(filters.status),
    formaPagamento: optional(filters.formaPagamento),
    origem: optional(filters.origem),
    canal: optional(filters.canal),
    crmStatus: optional(filters.crmStatus),
    segmento: optional(filters.segmento),
  };
}

export function buildBIRpcParams({ clinicId, period, filters = {} }) {
  if (!clinicId) throw new Error("Clínica obrigatória para consultar o BI.");
  const normalized = normalizeBIFilters(filters);
  return {
    p_clinica_id: clinicId,
    p_inicio: period.current.start.toISOString(),
    p_fim: period.current.end.toISOString(),
    p_anterior_inicio: period.previous.start.toISOString(),
    p_anterior_fim: period.previous.end.toISOString(),
    p_timezone: period.timeZone,
    p_profissional_id: normalized.profissional,
    p_procedimento_id: normalized.procedimento,
    p_categoria: normalized.categoria,
    p_status: normalized.status,
    p_forma_pagamento: normalized.formaPagamento,
    p_origem: normalized.origem,
    p_canal: normalized.canal,
    p_crm_status: normalized.crmStatus,
  };
}
