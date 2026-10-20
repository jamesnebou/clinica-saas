import { buildManagerialDre } from "./core.mjs";

export function compareDrePeriods(entries, selected, previous) {
  const currentRows = entries.filter((item) => item.competencia >= selected.start && item.competencia <= selected.end);
  const previousRows = entries.filter((item) => item.competencia >= previous.start && item.competencia <= previous.end);
  return {
    currentRows,
    current: buildManagerialDre(currentRows),
    prior: buildManagerialDre(previousRows),
  };
}
