import test from "node:test";
import assert from "node:assert/strict";
import { agendaRequestForQuestion, getClinicAgendaDetails } from "../src/lib/ai/agenda-details.mjs";
import { classifyManagementQuestion } from "../src/lib/ai/chat-intents.mjs";

const A = "clinic-a";
const B = "clinic-b";
const now = new Date("2026-11-04T12:00:00Z");
const clinic = { id: A, metadata: { timezone: "America/Sao_Paulo" } };
const appointments = [
  { id: "a1", clinica_id: A, cliente_id: "c1", profissional_id: "p1", procedimento_id: "r1", procedimento_ids: ["r1", "r2"], inicio: "2026-11-04T12:00:00Z", status: "agendado" },
  { id: "a2", clinica_id: A, cliente_id: "c2", profissional_id: "p2", procedimento_id: "r2", procedimento_ids: [], inicio: "2026-11-04T15:00:00Z", status: "confirmado" },
  { id: "b1", clinica_id: B, cliente_id: "c3", profissional_id: "p3", procedimento_id: "r3", procedimento_ids: [], inicio: "2026-11-04T13:00:00Z", status: "confirmado" },
  { id: "a3", clinica_id: A, cliente_id: "c1", profissional_id: "p1", procedimento_id: "r1", procedimento_ids: [], inicio: "2026-11-05T11:00:00Z", status: "concluido" },
  { id: "a4", clinica_id: A, cliente_id: "c2", profissional_id: "p2", procedimento_id: "r2", procedimento_ids: [], inicio: "2026-11-05T14:00:00Z", status: "cancelado" },
  { id: "a5", clinica_id: A, cliente_id: "c2", profissional_id: "p2", procedimento_id: "r2", procedimento_ids: [], inicio: "2026-11-05T15:00:00Z", status: "faltou" },
];
const tables = {
  agendamentos: appointments,
  clientes: [{ id: "c1", clinica_id: A, nome: "Ana Silva", telefone: "PRIVATE_PHONE" }, { id: "c2", clinica_id: A, nome: "Bia Lima" }, { id: "c3", clinica_id: B, nome: "OUTRO_TENANT" }],
  profissionais: [{ id: "p1", clinica_id: A, nome: "Lia" }, { id: "p2", clinica_id: A, nome: "Rita" }, { id: "p3", clinica_id: B, nome: "OUTRO_PROFISSIONAL" }],
  procedimentos: [{ id: "r1", clinica_id: A, nome: "Limpeza" }, { id: "r2", clinica_id: A, nome: "Drenagem" }, { id: "r3", clinica_id: B, nome: "OUTRO_PROCEDIMENTO" }],
};

function fakeDatabase({ rows = tables, fail = false } = {}) {
  const selects = [];
  return { selects, from(table) {
    const filters = [];
    let columns = "";
    let options = {};
    let offset = 0;
    let end = Infinity;
    const query = {
      select(value, config = {}) { columns = value; options = config; selects.push({ table, columns }); return this; },
      eq(key, value) { filters.push((row) => row[key] === value); return this; },
      gte(key, value) { filters.push((row) => row[key] >= value); return this; },
      lt(key, value) { filters.push((row) => row[key] < value); return this; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return this; },
      order() { return this; },
      range(first, last) { offset = first; end = last + 1; return Promise.resolve(this.result()); },
      result() {
        if (fail) return { data: null, count: null, error: { code: "synthetic_failure" } };
        const filtered = (rows[table] || []).filter((row) => filters.every((check) => check(row)));
        const sorted = table === "agendamentos" ? filtered.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id)) : filtered;
        return { data: options.head ? null : sorted.slice(offset, end), count: options.count === "exact" ? filtered.length : null, error: null };
      },
      then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); },
    };
    return query;
  } };
}

test("exact question is agenda details and covers two local calendar days", async () => {
  const question = "Quais são os clientes que tenho para hoje e amanhã e quais são os procedimentos?";
  assert.equal(classifyManagementQuestion(question).intent, "agenda_details");
  const request = agendaRequestForQuestion(question, null, clinic, now);
  assert.deepEqual([request.startDate, request.endDate, request.mode], ["2026-11-04", "2026-11-05", "list"]);
  const db = fakeDatabase();
  const result = await getClinicAgendaDetails({ supabase: db, clinic, request });
  assert.equal(result.total, 5);
  assert.deepEqual(result.days.map((day) => day.total), [2, 3]);
  assert.deepEqual(result.appointments.map((item) => item.client), ["Ana Silva", "Bia Lima", "Ana Silva", "Bia Lima", "Bia Lima"]);
  assert.deepEqual(result.appointments[0].procedures, ["Limpeza", "Drenagem"]);
  assert.deepEqual(result.appointments.map((item) => item.status), ["agendado", "confirmado", "concluido", "cancelado", "faltou"]);
  assert.deepEqual(result.appointments.map((item) => item.time), ["09:00", "12:00", "08:00", "11:00", "12:00"]);
  assert.doesNotMatch(JSON.stringify(result), /OUTRO_TENANT|OUTRO_PROCEDIMENTO|PRIVATE_PHONE/);
  assert.ok(db.selects.every(({ columns }) => !/telefone|email|cpf|observacoes|payload/.test(columns)));
  const other = await getClinicAgendaDetails({ supabase: fakeDatabase(), clinic: { ...clinic, id: B }, request });
  assert.equal(other.total, 1);
  assert.equal(other.appointments[0].client, "OUTRO_TENANT");
  assert.doesNotMatch(JSON.stringify(other), /Ana Silva|Bia Lima|Limpeza|Drenagem/);
});

test("follow-ups, status, count and first-hour requests remain in agenda", async () => {
  const original = agendaRequestForQuestion("Quais clientes tenho hoje e amanhã?", null, clinic, now);
  const previous = { ...original, mode: "list" };
  const unconfirmed = agendaRequestForQuestion("Quais desses ainda não confirmaram?", previous, clinic, now);
  assert.equal(classifyManagementQuestion("Quais desses ainda não confirmaram?", "agenda_details").intent, "agenda_details");
  assert.equal(unconfirmed.status, "agendado");
  assert.equal((await getClinicAgendaDetails({ supabase: fakeDatabase(), clinic, request: unconfirmed })).total, 1);
  const confirmed = agendaRequestForQuestion("Me mostre apenas os confirmados", previous, clinic, now);
  assert.equal(confirmed.status, "confirmado");
  assert.equal((await getClinicAgendaDetails({ supabase: fakeDatabase(), clinic, request: confirmed })).total, 1);
  const count = agendaRequestForQuestion("Quantos atendimentos tenho amanhã?", previous, clinic, now);
  const countResult = await getClinicAgendaDetails({ supabase: fakeDatabase(), clinic, request: count });
  assert.equal(countResult.total, 3);
  assert.deepEqual(countResult.appointments, []);
  const first = agendaRequestForQuestion("Qual é o primeiro horário de amanhã?", previous, clinic, now);
  assert.equal((await getClinicAgendaDetails({ supabase: fakeDatabase(), clinic, request: first })).appointments[0].time, "08:00");
  for (const question of ["Quem está agendado para amanhã?", "Quais procedimentos tenho hoje e amanhã?",
    "Me mostre minha agenda de amanhã.", "Quais atendimentos estão confirmados?",
    "Quem ainda não confirmou o horário de amanhã?", "Qual profissional fará cada atendimento hoje?"]) {
    assert.equal(classifyManagementQuestion(question).intent, "agenda_details", question);
  }
});

test("valid dates, empty days, bounded ranges and failed queries", async () => {
  assert.equal(agendaRequestForQuestion("Agenda de 31/02/2026", null, clinic, now), null);
  assert.equal(agendaRequestForQuestion("Agenda de 01/11/2026 a 10/11/2026", null, clinic, now), null);
  const request = agendaRequestForQuestion("Quem está agendado em 10/11/2026?", null, clinic, now);
  assert.equal(request.startDate, "2026-11-10");
  assert.equal((await getClinicAgendaDetails({ supabase: fakeDatabase(), clinic, request })).total, 0);
  await assert.rejects(getClinicAgendaDetails({ supabase: fakeDatabase({ fail: true }), clinic, request }), /AI_AGENDA_UNAVAILABLE/);
});

test("pagination reports remaining rows instead of silently truncating", async () => {
  const many = Array.from({ length: 53 }, (_, index) => ({ ...appointments[0], id: `many-${index}`, inicio: `2026-11-04T${String(10 + Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00Z` }));
  const rows = { ...tables, agendamentos: many };
  const request = agendaRequestForQuestion("Quem está agendado hoje?", null, clinic, now);
  const first = await getClinicAgendaDetails({ supabase: fakeDatabase({ rows }), clinic, request, page: 0 });
  const second = await getClinicAgendaDetails({ supabase: fakeDatabase({ rows }), clinic, request, page: 1 });
  assert.equal(first.appointments.length, 50);
  assert.equal(first.hasMore, true);
  assert.equal(second.appointments.length, 3);
  assert.equal(second.hasMore, false);
});

test("six-turn agenda context re-queries scoped rows without a model", async () => {
  const rows = { ...tables, agendamentos: [
    { ...appointments[0], id: "tomorrow-1", inicio: "2026-11-05T12:00:00Z" },
    { ...appointments[1], id: "tomorrow-2", inicio: "2026-11-05T15:00:00Z" },
    { ...appointments[2], id: "foreign-tomorrow", inicio: "2026-11-05T13:00:00Z" },
    { ...appointments[0], id: "after-tomorrow", inicio: "2026-11-06T12:00:00Z" },
  ] };
  const turns = [
    ["Quantos agendamentos tenho amanhã?", "count", "2026-11-05", 2],
    ["Quais são eles?", "list", "2026-11-05", 2],
    ["Algum ainda não confirmou?", "count", "2026-11-05", 1],
    ["Quais procedimentos serão realizados?", "procedures", "2026-11-05", 1],
    ["Quem é o primeiro cliente?", "first", "2026-11-05", 1],
    ["E para depois de amanhã?", "list", "2026-11-06", 1],
  ];
  let previous = null;
  for (const [question, mode, date, total] of turns) {
    const intent = classifyManagementQuestion(question, previous ? "agenda_details" : null);
    assert.equal(intent.intent, "agenda_details", question);
    const request = agendaRequestForQuestion(question, previous, clinic, now);
    assert.equal(request.mode, mode, question);
    assert.equal(request.startDate, date, question);
    const db = fakeDatabase({ rows });
    const result = await getClinicAgendaDetails({ supabase: db, clinic, request });
    assert.equal(result.total, total, question);
    assert.doesNotMatch(JSON.stringify(result), /OUTRO_TENANT|PRIVATE_PHONE|OUTRO_PROCEDIMENTO/);
    assert.ok(db.selects.every(({ columns }) => !/telefone|email|cpf|observacoes/.test(columns)));
    if (mode === "count") assert.deepEqual(result.appointments, []);
    if (mode === "list" || mode === "first") assert.equal(result.appointments[0].client, "Ana Silva");
    if (mode === "procedures") assert.equal(result.appointments[0].client, null);
    previous = result.agendaContext;
  }
  const next = agendaRequestForQuestion("E no dia seguinte?", previous, clinic, now);
  assert.equal(next.startDate, "2026-11-07");
  for (const question of ["Quem são?", "Me mostre esses agendamentos.", "Quais são esses dois?",
    "E os procedimentos?", "Qual o horário deles?", "Mostre apenas os confirmados.", "E amanhã?", "E no dia seguinte?"]) {
    assert.equal(classifyManagementQuestion(question, "agenda_details").intent, "agenda_details", question);
  }
  assert.equal(classifyManagementQuestion("Quais são eles?").intent, null);
  assert.match(classifyManagementQuestion("Quais são eles?").message, /Informe a data/);
  const foreign = await getClinicAgendaDetails({ supabase: fakeDatabase({ rows }), clinic: { ...clinic, id: B }, request: {
    ...previous, startDate: "2026-11-05", endDate: "2026-11-05", status: null, mode: "list",
  } });
  assert.equal(foreign.total, 1);
  assert.equal(foreign.appointments[0].client, "OUTRO_TENANT");
  assert.doesNotMatch(JSON.stringify(foreign), /Ana Silva|Bia Lima/);
});
