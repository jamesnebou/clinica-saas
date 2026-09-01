import assert from "node:assert/strict";
import test from "node:test";
import {
  addDaysToDateKey,
  buildCalendarMonth,
  clinicDateKey,
  formatBrazilianDate,
  monthKeyFromDateKey,
  shiftMonthKey,
} from "../src/lib/public-booking/calendar-core.mjs";

test("calendário usa a data da clínica sem depender do fuso do aparelho", () => {
  const instant = new Date("2026-09-02T01:30:00.000Z");
  assert.equal(clinicDateKey("America/Bahia", instant), "2026-09-01");
});

test("soma de dias preserva viradas de mês e ano", () => {
  assert.equal(addDaysToDateKey("2026-09-30", 1), "2026-10-01");
  assert.equal(addDaysToDateKey("2026-12-31", 1), "2027-01-01");
});

test("navegação mensal preserva viradas de ano", () => {
  assert.equal(shiftMonthKey("2026-12", 1), "2027-01");
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
});

test("grade mensal possui seis semanas estáveis e datas consecutivas", () => {
  const days = buildCalendarMonth("2026-09");
  assert.equal(days.length, 42);
  assert.equal(days[0].date, "2026-08-30");
  assert.equal(days.at(-1).date, "2026-10-10");
  assert.equal(days.filter((day) => day.inMonth).length, 30);
});

test("formata a data selecionada para português e rejeita entradas inválidas", () => {
  assert.equal(monthKeyFromDateKey("2026-09-15"), "2026-09");
  assert.match(formatBrazilianDate("2026-09-15"), /15 de setembro de 2026/);
  assert.equal(addDaysToDateKey("2026-02-31", 1), "");
  assert.deepEqual(buildCalendarMonth("2026-13"), []);
});
