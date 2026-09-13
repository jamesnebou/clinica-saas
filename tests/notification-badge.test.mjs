import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const layout = read("src/app/dashboard/layout.js");
const badgeSource = layout.match(/async function getNotificationBadgeCount[\s\S]*?(?=\nexport default)/)?.[0];
assert.ok(badgeSource, "Dashboard badge function must exist");
const now = "2030-06-15T12:00:00.000Z";
const cutoff = "2030-06-08T12:00:00.000Z";
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
}
const booking = (overrides = {}) => ({
  id: "booking-a", clinica_id: "clinic-a", pagamento_status: "pendente",
  created_at: now, visualizado_em: null, ...overrides,
});

function harness(rows, error = null) {
  const queries = [];
  const logs = [];
  const supabaseAdmin = {
    from(table) {
      const filters = [];
      const query = { table, filters };
      queries.push(query);
      const chain = {
        select(columns, options) { Object.assign(query, { columns, options }); return chain; },
        eq(column, value) { filters.push((row) => row[column] === value); return chain; },
        in(column, values) { filters.push((row) => values.includes(row[column])); return chain; },
        gte(column, value) { query.since = value; filters.push((row) => row[column] >= value); return chain; },
        is(column, value) { filters.push((row) => row[column] === value); return chain; },
        then(resolve, reject) {
          return Promise.resolve({ count: rows.filter((row) => filters.every((filter) => filter(row))).length, error }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const count = new Function("supabaseAdmin", "Date", "console", badgeSource + "\nreturn getNotificationBadgeCount;")(
    supabaseAdmin, FixedDate, { error: (...args) => logs.push(args) },
  );
  return { count, queries, logs };
}

for (const pagamento_status of ["pendente", "erro", "sem_sinal", "pago"]) {
  test(`NOTIF-FIX-01: ${pagamento_status} + nao visualizada entra no badge`, async () => {
    const h = harness([booking({ pagamento_status })]);
    assert.equal(await h.count({ id: "clinic-a" }), 1);
    assert.equal(h.queries.length, 1);
    assert.equal(h.queries[0].table, "site_agendamentos_publicos");
    assert.deepEqual(h.queries[0].options, { count: "exact", head: true });
  });
  test(`NOTIF-FIX-01: ${pagamento_status} + visualizada nao entra no badge`, async () => {
    const h = harness([booking({ pagamento_status, visualizado_em: now })]);
    assert.equal(await h.count({ id: "clinic-a" }), 0);
  });
}

test("NOTIF-FIX-01: todos os status, inclusive cancelado/nulo, dependem apenas de visualizacao", async () => {
  const statuses = ["pendente", "erro", "sem_sinal", "pago", "cancelado", null];
  const h = harness(statuses.flatMap((pagamento_status) => [
    booking({ pagamento_status }), booking({ pagamento_status, visualizado_em: now }),
  ]));
  assert.equal(await h.count({ id: "clinic-a" }), statuses.length);
});

test("NOTIF-FIX-01: preserva a janela de sete dias, incluindo o limite", async () => {
  const h = harness([
    booking({ created_at: "2030-06-08T11:59:59.999Z" }),
    booking({ created_at: cutoff }),
    booking({ created_at: "2030-06-14T12:00:00.000Z" }),
  ]);
  assert.equal(await h.count({ id: "clinic-a" }), 2);
  assert.equal(h.queries[0].since, cutoff);
});

test("NOTIF-FIX-01: contagem isolada por clinica_id mesmo com cliente privilegiado", async () => {
  const h = harness([
    booking(), booking({ clinica_id: "clinic-b", pagamento_status: "pago" }),
    booking({ clinica_id: "clinic-b", pagamento_status: "sem_sinal" }),
  ]);
  assert.equal(await h.count({ id: "clinic-a" }), 1);
  assert.equal(await h.count({ id: "clinic-b" }), 2);
  assert.equal(await h.count({ id: "clinic-c" }), 0);
});

test("NOTIF-FIX-01: erro de consulta nao reconta registros visualizados nem expoe erro bruto", async () => {
  const h = harness([booking({ visualizado_em: now })], { message: "sensitive fixture", code: "42703" });
  assert.equal(await h.count({ id: "clinic-a" }), 0);
  assert.equal(h.queries.length, 1);
  assert.deepEqual(h.logs, [["notification_badge_count_failed"]]);
});

test("NOTIF-FIX-01: botao explicito preserva action e estado visualizada", () => {
  const page = read("src/app/dashboard/notificacoes/page.js");
  assert.match(page, /<form action=\{markNotificationViewedAction\}[\s\S]*?Marcar como visualizada/);
  assert.doesNotMatch(page, />\s*Visualizado\s*</);
  assert.match(page, /visualizacaoDisponivel && !item\.visualizado_em/);
  assert.match(page, />Visualizada<\/span>/);
});

test("NOTIF-FIX-01: marcar visualizada atualiza somente a clinica autenticada", async () => {
  const source = read("src/app/dashboard/notificacoes/actions.js")
    .replace(/^import[\s\S]*?;\r?$/gm, "").replace(/^export /gm, "");
  const rows = [booking(), booking({ clinica_id: "clinic-b" })];
  const revalidated = [];
  const action = new Function("requireClinicSection", "supabaseAdmin", "revalidatePath", source + "\nreturn markNotificationViewedAction;")(
    async (section) => { assert.equal(section, "notificacoes"); return { activeClinic: { id: "clinic-a" } }; },
    {
      from(table) {
        assert.equal(table, "site_agendamentos_publicos");
        const filters = [];
        let update;
        const chain = {
          update(value) { update = value; return chain; },
          eq(column, value) { filters.push((row) => row[column] === value); return chain; },
          then(resolve) {
            rows.filter((row) => filters.every((filter) => filter(row))).forEach((row) => Object.assign(row, update));
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return chain;
      },
    },
    (route) => revalidated.push(route),
  );
  const form = new FormData();
  form.set("id", "booking-a");
  form.set("clinica_id", "clinic-b");
  await action(form);
  assert.ok(rows[0].visualizado_em);
  assert.equal(rows[1].visualizado_em, null);
  const h = harness(rows);
  assert.equal(await h.count({ id: "clinic-a" }), 0);
  assert.equal(await h.count({ id: "clinic-b" }), 1);
  assert.ok(revalidated.includes("/dashboard"));
  assert.ok(revalidated.includes("/dashboard/notificacoes"));
});
