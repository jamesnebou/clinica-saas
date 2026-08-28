import { getOperator } from "./registry/operators.mjs";

const FORBIDDEN_PATH_PARTS = new Set(["__proto__", "prototype", "constructor"]);

export function getContextValue(context, path) {
  if (!path || typeof path !== "string") return undefined;
  return path.split(".").reduce((value, part) => {
    if (FORBIDDEN_PATH_PARTS.has(part) || value === null || value === undefined || typeof value !== "object") return undefined;
    return Object.prototype.hasOwnProperty.call(value, part) ? value[part] : undefined;
  }, context);
}

function empty(value) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function comparable(value, type) {
  if (type === "number" || type === "money") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  if (type === "date" || type === "datetime") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  if (type === "boolean") return value === true || value === "true" || value === 1 || value === "1";
  return value;
}

function equals(left, right, type) {
  if (Array.isArray(left)) return left.some((item) => equals(item, right, type));
  return comparable(left, type) === comparable(right, type);
}

export function evaluatePredicate(predicate, context) {
  const operator = getOperator(predicate?.operator);
  if (!operator) throw new Error(`Operador inválido: ${predicate?.operator || "vazio"}.`);
  const left = getContextValue(context, predicate.field);
  const type = predicate.valueType || "string";
  const right = predicate.value;
  switch (predicate.operator) {
    case "equals": return equals(left, right, type);
    case "not_equals": return !equals(left, right, type);
    case "in": return Array.isArray(right) && right.some((item) => equals(left, item, type));
    case "not_in": return Array.isArray(right) && !right.some((item) => equals(left, item, type));
    case "contains": return Array.isArray(left) ? left.some((item) => equals(item, right, type)) : String(left ?? "").toLocaleLowerCase("pt-BR").includes(String(right ?? "").toLocaleLowerCase("pt-BR"));
    case "not_contains": return !evaluatePredicate({ ...predicate, operator: "contains" }, context);
    case "greater_than": return comparable(left, type) > comparable(right, type);
    case "greater_or_equal": return comparable(left, type) >= comparable(right, type);
    case "less_than": return comparable(left, type) < comparable(right, type);
    case "less_or_equal": return comparable(left, type) <= comparable(right, type);
    case "is_empty": return empty(left);
    case "is_not_empty": return !empty(left);
    case "before": return comparable(left, type) < comparable(right, type);
    case "after": return comparable(left, type) > comparable(right, type);
    case "between": return Array.isArray(right) && right.length === 2 && comparable(left, type) >= comparable(right[0], type) && comparable(left, type) <= comparable(right[1], type);
    default: return false;
  }
}

export function evaluateConditionGroup(group, context) {
  if (!group || !Array.isArray(group.conditions) || group.conditions.length === 0) return true;
  const results = group.conditions.map((condition) => condition?.kind === "group" ? evaluateConditionGroup(condition, context) : evaluatePredicate(condition, context));
  return String(group.operator || "AND").toUpperCase() === "OR" ? results.some(Boolean) : results.every(Boolean);
}
