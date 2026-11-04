import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const userA = { id: "user-a", email: "a@example.invalid" };
const userB = { id: "user-b", email: "b@example.invalid" };
const clinic = (id) => ({ id, nome: id === A ? "CLINIC_A" : "CLINIC_B", plan_entitlements_mode: "unlimited_lifetime", metadata: { timezone: "America/Bahia" } });
const state = { user: userA, selected: A, rows: {}, queries: [], generated: [], limits: [], failedTable: null };
globalThis.__ai02c = state;

const fakeModules = new Map([
  ["next/navigation", "export const redirect = () => { throw new Error('REDIRECT'); };"],
  ["next/headers", "export const cookies = async () => ({ get: () => ({ value: globalThis.__ai02c.selected }) });"],
  ["@/lib/supabase/server", "export const createClient = async () => globalThis.__ai02c.client;"],
  ["@/lib/saas/plans", "export const isInternalAdminEmail = () => false; export const getClinicPlan = async () => null;"],
  ["@/lib/auth/permissions", "export const canAccessSection = () => false; export const getCurrentMembership = () => null; export const sectionHasCapability = () => false;"],
  ["@/lib/segments/service", "export const getClinicCapabilities = async () => ({});"],
  ["@/lib/saas/plan-entitlements.mjs", "export const assertPlanEntitlement = () => {}; export const effectivePlanAccess = () => false;"],
  ["@/lib/security/public-antiabuse", `export const consumePublicRateLimit = (input) => { globalThis.__ai02c.limits.push(input); return { allowed: true }; };
    export const hashPublicRateLimitValue = () => 'opaque-tenant';
    export const noStoreJson = (body, init = {}) => Response.json(body, { ...init, headers: { ...init.headers, 'Cache-Control': 'no-store' } });`],
  ["@/lib/ai/summary-generation.mjs", `export const generateClinicSummary = async ({ snapshot }) => {
    globalThis.__ai02c.generated.push(snapshot);
    return { title: 'Synthetic summary', executiveSummary: 'Synthetic only', highlights: [], alerts: [], opportunities: [], recommendedActions: [] };
  };`],
]);
const realAliases = new Map([
  ["@/lib/auth/session", "../src/lib/auth/session.js"],
  ["@/lib/clinic/schedule", "../src/lib/clinic/schedule.js"],
  ["@/lib/ai/access.mjs", "../src/lib/ai/access.mjs"],
  ["@/lib/ai/clinic-summary-data", "../src/lib/ai/clinic-summary-data.js"],
  ["@/lib/ai/summary-flow.mjs", "../src/lib/ai/summary-flow.mjs"],
  ["@/lib/security/public-antiabuse-core.mjs", "../src/lib/security/public-antiabuse-core.mjs"],
]);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (fakeModules.has(specifier)) return { url: `data:text/javascript,${encodeURIComponent(fakeModules.get(specifier))}`, shortCircuit: true };
  if (realAliases.has(specifier)) return { url: new URL(realAliases.get(specifier), import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });

const { buildSummaryPeriod, getClinicSummarySnapshot } = await import("../src/lib/ai/clinic-summary-data.js");
const { POST } = await import("../src/app/api/ai/summary/route.js");
const originalModel = process.env.AI_GATEWAY_MODEL;
process.env.AI_GATEWAY_MODEL = "test/model";
test.after(() => {
  if (originalModel === undefined) delete process.env.AI_GATEWAY_MODEL;
  else process.env.AI_GATEWAY_MODEL = originalModel;
  delete globalThis.__ai02c;
});

function query(table) {
  const filters = [];
  let head = false;
  let count = false;
  const result = (start = 0, end = Infinity) => {
    state.queries.push({ table, filters: [...filters] });
    if (state.failedTable === table) return { data: null, count: null, error: { code: "TEST_QUERY_FAILURE" } };
    let rows = state.rows[table] || [];
    for (const [operator, key, expected] of filters) {
      rows = rows.filter((row) => operator === "eq" ? row[key] === expected
        : operator === "gte" ? row[key] >= expected
          : operator === "lt" ? row[key] < expected
            : operator === "in" ? expected.includes(row[key]) : false);
    }
    return { data: head ? null : rows.slice(start, end + 1), count: count ? rows.length : null, error: null };
  };
  const builder = {
    select(_columns, options = {}) { head = options.head === true; count = options.count === "exact"; return builder; },
    eq(key, value) { filters.push(["eq", key, value]); return builder; },
    gte(key, value) { filters.push(["gte", key, value]); return builder; },
    lt(key, value) { filters.push(["lt", key, value]); return builder; },
    in(key, value) { filters.push(["in", key, value]); return builder; },
    order() { return builder; },
    range(start, end) { return Promise.resolve(result(start, end)); },
    maybeSingle() { return Promise.resolve({ data: result().data[0] || null, error: state.failedTable === table ? { code: "TEST_QUERY_FAILURE" } : null }); },
    then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
  };
  return builder;
}
state.client = {
  auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  from: (table) => query(table),
};

const now = new Date();
const period7 = buildSummaryPeriod(clinic(A), 7, now);
const period30 = buildSummaryPeriod(clinic(A), 30, now);
const currentDay = new Date(new Date(period7.end).getTime() - 86400000).toISOString();
const olderDay = new Date(new Date(period7.start).getTime() - 86400000).toISOString();
const upcomingDay = new Date(now.getTime() + 2 * 86400000).toISOString();

function seed() {
  state.rows = {
    usuarios_clinica: [
      { clinica_id: A, user_id: userA.id, email: userA.email, papel: "owner", ativo: true, clinicas: clinic(A) },
      { clinica_id: B, user_id: userB.id, email: userB.email, papel: "admin", ativo: true, clinicas: clinic(B) },
    ],
    clinicas: [clinic(A), clinic(B)],
    agendamentos: [
      ...Array.from({ length: 12 }, (_, index) => ({ clinica_id: A, inicio: currentDay, status: "concluido", procedimento_id: index === 0 ? "proc-b" : "proc-a" })),
      ...Array.from({ length: 75 }, () => ({ clinica_id: B, inicio: currentDay, status: "concluido", procedimento_id: "proc-b" })),
      ...Array.from({ length: 3 }, () => ({ clinica_id: A, inicio: olderDay, status: "concluido", procedimento_id: "proc-a" })),
      ...Array.from({ length: 5 }, () => ({ clinica_id: B, inicio: olderDay, status: "concluido", procedimento_id: "proc-b" })),
      ...Array.from({ length: 2 }, () => ({ clinica_id: A, inicio: upcomingDay, status: "agendado", procedimento_id: "proc-a" })),
      ...Array.from({ length: 7 }, () => ({ clinica_id: B, inicio: upcomingDay, status: "confirmado", procedimento_id: "proc-b" })),
    ],
    finance_movimentos: [
      { clinica_id: A, data_movimento: currentDay, tipo: "entrada", valor_liquido: 2000 },
      { clinica_id: A, data_movimento: currentDay, tipo: "ajuste_entrada", valor_liquido: 500 },
      { clinica_id: A, data_movimento: currentDay, tipo: "saida", valor_liquido: 200 },
      { clinica_id: A, data_movimento: currentDay, tipo: "ajuste_saida", valor_liquido: 50 },
      { clinica_id: A, data_movimento: currentDay, tipo: "estorno", valor_liquido: 25 },
      { clinica_id: B, data_movimento: currentDay, tipo: "entrada", valor_liquido: 18000 },
    ],
    clientes: [...Array.from({ length: 8 }, (_, index) => ({ id: `a-${index}`, clinica_id: A, created_at: index < 2 ? currentDay : olderDay })),
      ...Array.from({ length: 45 }, (_, index) => ({ id: `b-${index}`, clinica_id: B, created_at: index < 10 ? currentDay : olderDay }))],
    procedimentos: [{ id: "proc-a", clinica_id: A, nome: "A_ONLY_PROCEDURE" }, { id: "proc-b", clinica_id: B, nome: "B_ONLY_PROCEDURE" }],
  };
  state.user = userA;
  state.selected = A;
  state.queries = [];
  state.generated = [];
  state.limits = [];
  state.failedTable = null;
}

function request(body, origin) {
  return new Request("https://local.invalid/api/ai/summary", { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
}

test("real snapshot query builder isolates A and B for 7 and 30 days", async () => {
  seed();
  for (const days of [7, 30]) {
    const a = await getClinicSummarySnapshot({ supabase: state.client, clinic: clinic(A), days, now });
    const b = await getClinicSummarySnapshot({ supabase: state.client, clinic: clinic(B), days, now });
    assert.equal(a.agenda.total, days === 7 ? 12 : 15);
    assert.equal(b.agenda.total, days === 7 ? 75 : 80);
    assert.equal(a.finance.realizedEntries, 2500);
    assert.equal(b.finance.realizedEntries, 18000);
    assert.equal(a.finance.realizedExits, 275);
    assert.equal(a.customers.total, 8);
    assert.equal(b.customers.total, 45);
    assert.equal(a.customers.newInPeriod, days === 7 ? 2 : 8);
    assert.equal(b.customers.newInPeriod, days === 7 ? 10 : 45);
    assert.equal(a.agenda.upcoming, 2);
    assert.equal(b.agenda.upcoming, 7);
    assert.equal(a.procedures.some((item) => item.name === "B_ONLY_PROCEDURE"), false);
    assert.equal(b.procedures.some((item) => item.name === "A_ONLY_PROCEDURE"), false);
    assert.equal(a.period.start, (days === 7 ? period7 : period30).start);
  }
  for (const item of state.queries) {
    if (["agendamentos", "finance_movimentos", "clientes", "procedimentos"].includes(item.table)) {
      assert.equal(item.filters.some(([op, key, value]) => op === "eq" && key === "clinica_id" && [A, B].includes(value)), true, item.table);
    }
  }
});

test("snapshot handles empty clinics, pagination and query failures without foreign rows", async () => {
  seed();
  state.rows.agendamentos = [
    ...Array.from({ length: 505 }, () => ({ clinica_id: A, inicio: currentDay, status: "concluido", procedimento_id: "proc-a" })),
    ...Array.from({ length: 3 }, () => ({ clinica_id: B, inicio: currentDay, status: "concluido", procedimento_id: "proc-b" })),
  ];
  assert.equal((await getClinicSummarySnapshot({ supabase: state.client, clinic: clinic(A), days: 7, now })).agenda.total, 505);
  state.rows.agendamentos = [];
  state.rows.finance_movimentos = [];
  state.rows.clientes = [];
  state.rows.procedimentos = [];
  const empty = await getClinicSummarySnapshot({ supabase: state.client, clinic: clinic(A), days: 7, now });
  assert.equal(empty.agenda.total, 0);
  assert.equal(empty.finance.realizedEntries, 0);
  assert.equal(empty.customers.total, 0);
  for (const table of ["agendamentos", "finance_movimentos", "clientes", "procedimentos"]) {
    seed();
    state.failedTable = table;
    await assert.rejects(getClinicSummarySnapshot({ supabase: state.client, clinic: clinic(A), days: 7, now }), /AI_DATA_UNAVAILABLE/);
  }
});

test("full POST path uses server session, selected clinic, entitlement, limiter and scoped snapshot", async () => {
  seed();
  for (const [user, selected, expectedClinic, expectedTotal] of [[userA, A, A, 12], [userB, B, B, 75]]) {
    state.user = user;
    state.selected = selected;
    const response = await POST(request({ days: 7 }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(state.limits.at(-1).tenantId, expectedClinic);
    assert.equal(state.generated.at(-1).agenda.total, expectedTotal);
    assert.equal(state.generated.at(-1).finance.realizedEntries, expectedClinic === A ? 2500 : 18000);
    assert.equal((await response.json()).analysis.title, "Synthetic summary");
  }
  assert.equal(state.generated.length, 2);
});

test("cross-tenant body, foreign cookie, absent user, inactive membership, role and plan deny before generation", async () => {
  seed();
  const deny = async (body, status) => {
    const before = state.generated.length;
    const limits = state.limits.length;
    const response = await POST(request(body));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(state.generated.length, before);
    assert.equal(state.limits.length, limits);
  };
  await deny({ days: 7, clinicId: B }, 400);
  await deny({ days: 7, clinica_id: B }, 400);
  state.selected = B;
  await POST(request({ days: 7 })).then(async (response) => {
    assert.equal(response.status, 200);
    assert.equal(state.generated.at(-1).agenda.total, 12);
  });
  state.generated = [];
  state.limits = [];
  state.user = null;
  await deny({ days: 7 }, 401);
  state.user = { id: "unassociated", email: "none@example.invalid" };
  await deny({ days: 7 }, 403);
  state.user = userA;
  state.selected = A;
  state.rows.usuarios_clinica[0].ativo = false;
  await deny({ days: 7 }, 403);
  state.rows.usuarios_clinica[0].ativo = true;
  state.rows.usuarios_clinica[0].papel = "recepcao";
  await deny({ days: 7 }, 403);
  state.rows.usuarios_clinica[0].papel = "profissional";
  await deny({ days: 7 }, 403);
  state.rows.usuarios_clinica[0].papel = "owner";
  state.rows.clinicas[0].plan_entitlements_mode = "catalog_v1";
  await deny({ days: 7 }, 403);
  state.rows.clinicas[0].plan_entitlements_mode = "unlimited_lifetime";
  state.rows.usuarios_clinica.push({ clinica_id: B, user_id: userB.id, email: userA.email, papel: "admin", ativo: true, clinicas: clinic(B) });
  state.selected = B;
  await deny({ days: 7 }, 403);
});

test("bad origin, invalid period and data errors never invoke generator", async () => {
  seed();
  const foreign = await POST(request({ days: 7 }, "https://foreign.invalid"));
  assert.equal(foreign.status, 403);
  const invalid = await POST(request({ days: 60 }));
  assert.equal(invalid.status, 400);
  state.failedTable = "finance_movimentos";
  const broken = await POST(request({ days: 7 }));
  assert.equal(broken.status, 503);
  assert.deepEqual(await broken.json(), { error: "AI_UNAVAILABLE" });
  assert.equal(state.generated.length, 0);
});
