import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bookingFormPath = new URL("../src/app/c/[slug]/booking-form.js", import.meta.url);
const availabilityPath = new URL("../src/app/api/public/availability/route.js", import.meta.url);
const agendaPath = new URL("../src/app/dashboard/agenda/page.js", import.meta.url);

test("seleção pública usa diálogos para procedimentos e calendário", async () => {
  const source = await readFile(bookingFormPath, "utf8");
  assert.match(source, /aria-labelledby="procedure-dialog-title"/);
  assert.match(source, /Concluir seleção/);
  assert.match(source, /aria-labelledby="calendar-dialog-title"/);
  assert.match(source, /Data selecionada:/);
  assert.match(source, /availableDateSet\.has\(day\.date\)/);
  assert.match(source, /event\.target === event\.currentTarget/);
});

test("disponibilidade mensal retorna somente datas com horários", async () => {
  const source = await readFile(availabilityPath, "utf8");
  assert.match(source, /searchParams\.get\("month"\)/);
  assert.match(source, /available_dates: availableDates/);
  assert.match(source, /slotsForDate/);
});

test("agenda interna recupera todos os procedimentos do agendamento público", async () => {
  const source = await readFile(agendaPath, "utf8");
  assert.match(source, /site_agendamentos_publicos/);
  assert.match(source, /item\.payload\?\.procedimentos/);
  assert.match(source, /publicProcedureNames\.join\(", "\)/);
  assert.match(source, /procedimento: procedureText/);
});
