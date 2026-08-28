export const OPERATOR_REGISTRY = Object.freeze({
  equals: { label: "Igual a", types: ["string", "number", "money", "boolean", "date", "datetime", "enum", "reference"] },
  not_equals: { label: "Diferente de", types: ["string", "number", "money", "boolean", "date", "datetime", "enum", "reference"] },
  in: { label: "Está em", types: ["string", "number", "money", "enum", "reference"] },
  not_in: { label: "Não está em", types: ["string", "number", "money", "enum", "reference"] },
  contains: { label: "Contém", types: ["string", "enum", "reference"] },
  not_contains: { label: "Não contém", types: ["string", "enum", "reference"] },
  greater_than: { label: "Maior que", types: ["number", "money", "date", "datetime"] },
  greater_or_equal: { label: "Maior ou igual", types: ["number", "money", "date", "datetime"] },
  less_than: { label: "Menor que", types: ["number", "money", "date", "datetime"] },
  less_or_equal: { label: "Menor ou igual", types: ["number", "money", "date", "datetime"] },
  is_empty: { label: "Está vazio", types: ["string", "enum", "reference", "date", "datetime"] },
  is_not_empty: { label: "Não está vazio", types: ["string", "enum", "reference", "date", "datetime"] },
  before: { label: "Antes de", types: ["date", "datetime"] },
  after: { label: "Depois de", types: ["date", "datetime"] },
  between: { label: "Entre", types: ["number", "money", "date", "datetime"] },
});

export function getOperator(type) {
  return OPERATOR_REGISTRY[type] || null;
}

export function operatorSupportsType(operator, valueType) {
  return Boolean(getOperator(operator)?.types.includes(valueType));
}
