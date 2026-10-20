import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareDrePeriods } from "../src/lib/finance/dre-periods.mjs";
import { PACKAGE_SALES_SELECT, packageSalesQuery } from "../src/lib/finance/package-sales.mjs";
import { clinicHasEntitlement } from "../src/lib/saas/plan-entitlements.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const period = (month) => ({ start: `${month}-01`, end: `${month}-31` });

test("DRE compara somente competencia selecionada e mes anterior", () => {
  const entries = [
    { competencia: "2026-08-01", grupo_dre: "receita_bruta", valor: 100 },
    { competencia: "2026-09-01", grupo_dre: "receita_bruta", valor: 200 },
    { competencia: "2026-10-01", grupo_dre: "receita_bruta", valor: 300 },
  ];
  const recent = compareDrePeriods(entries, period("2026-10"), period("2026-09"));
  assert.equal(recent.current.receita_bruta, 300);
  assert.equal(recent.prior.receita_bruta, 200);
  const historical = compareDrePeriods(entries, period("2026-09"), period("2026-08"));
  assert.equal(historical.current.receita_bruta, 200);
  assert.equal(historical.prior.receita_bruta, 100);
  const empty = compareDrePeriods(entries, period("2026-12"), period("2026-11"));
  assert.equal(empty.currentRows.length, 0);
  assert.equal(empty.current.receita_bruta, 0);
  assert.equal(empty.prior.receita_bruta, 0);
});

test("DRE exige entitlement, expoe seletor e nao troca mes vazio por historico", async () => {
  const clinic = (plano, mode = "catalog_v1") => ({ id: "clinic-a", plano, plan_entitlements_mode: mode, plan_entitlements_version: 1 });
  assert.equal(clinicHasEntitlement(clinic("starter", "internal_full_access"), "dre"), true);
  assert.equal(clinicHasEntitlement(clinic("premium"), "dre"), true);
  assert.equal(clinicHasEntitlement(clinic("growth"), "dre"), false);
  const page = await source("src/app/dashboard/financeiro/dre/page.js");
  assert.match(page, /requireClinicCapability\("financeiro", "dre"/);
  assert.match(page, /name="month" type="month" required defaultValue=\{currentPeriod\.month\}/);
  assert.match(page, /compareDrePeriods\(normalized, currentPeriod, priorPeriod\)/);
  assert.match(page, /!currentRows\.length \? <p/);
});

function fakePackageClient(rows, calls) {
  const query = {
    select(value) { calls.push(["select", value]); return this; },
    eq(column, value) { calls.push(["eq", column, value]); this.clinicId = value; return this; },
    order(column, options) { calls.push(["order", column, options.ascending]); return this; },
    limit(value) { calls.push(["limit", value]); return Promise.resolve({ data: rows.filter((row) => row.clinica_id === this.clinicId), error: null }); },
  };
  return { from(table) { calls.push(["from", table]); return query; } };
}

test("Pacotes seleciona FK composta e restringe a clinica, mesmo sem vendas", async () => {
  const calls = [];
  const result = await packageSalesQuery(fakePackageClient([], calls), "tenant-a");
  assert.deepEqual(result.data, []);
  assert.equal(PACKAGE_SALES_SELECT, "*,clientes!cliente_pacotes_cliente_tenant_fk(nome)");
  assert.deepEqual(calls, [
    ["from", "cliente_pacotes"],
    ["select", PACKAGE_SALES_SELECT],
    ["eq", "clinica_id", "tenant-a"],
    ["order", "created_at", false],
    ["limit", 200],
  ]);
});

test("Pacotes lista venda existente sem misturar registros de outro tenant", async () => {
  const rows = [
    { id: "sale-a", clinica_id: "tenant-a", clientes: { nome: "Cliente A" } },
    { id: "sale-b", clinica_id: "tenant-b", clientes: { nome: "Cliente B" } },
  ];
  const result = await packageSalesQuery(fakePackageClient(rows, []), "tenant-a");
  assert.deepEqual(result.data.map((row) => [row.id, row.clientes.nome]), [["sale-a", "Cliente A"]]);
  const page = await source("src/app/dashboard/financeiro/pacotes/page.js");
  assert.match(page, /packageSalesQuery\(supabase, activeClinic\.id\)/);
  assert.match(page, /item\.clientes\?\.nome \|\| "-"/);
  assert.match(page, /requireClinicCapability\("financeiro", "financeiro_avancado"/);
});

test("competencia continua pelo fato gerador; backfill separado e idempotente", async () => {
  const migration = await source("supabase/migrations/20261019100000_agendamento_competencia_continua.sql");
  const backfill = await source("supabase/backfills/20261019_agendamento_competencias_pendentes.sql");
  const sqlTest = await source("supabase/tests/finance_competencia_continua.test.sql");
  assert.match(migration, /after insert or update of status, inicio on public\.agendamentos/i);
  assert.match(migration, /after insert or update or delete on public\.finance_recebiveis/i);
  assert.match(migration, /v_agendamento\.status <> 'concluido'/);
  assert.match(migration, /v_recebivel\.id is null and p_create_missing and v_agendamento\.valor > 0/);
  assert.match(migration, /insert into public\.finance_recebiveis[\s\S]*on conflict \(clinica_id, origem_tipo, origem_id\) do nothing/);
  assert.match(migration, /finance_sync_agendamento_competencia\(new\.clinica_id, new\.id, true\)/);
  assert.match(migration, /finance_sync_agendamento_competencia\(new\.clinica_id, new\.agendamento_id, false\)/);
  assert.match(migration, /date_trunc\('month', v_agendamento\.inicio\)::date/);
  assert.match(migration, /on conflict \(clinica_id, origem_tipo, origem_id, tipo\) do update/);
  assert.match(migration, /set estornada = true/);
  assert.match(migration, /v_recebivel\.metadata->>'demo' = 'true'/);
  assert.match(backfill, /left join public\.finance_recebiveis r/);
  assert.match(backfill, /left join public\.finance_competencias c/);
  assert.match(backfill, /r\.id is null or c\.id is null or c\.estornada/);
  assert.match(backfill, /finance_sync_agendamento_competencia\([\s\S]*v_agendamento\.clinica_id, v_agendamento\.id, true/);
  assert.match(sqlTest, /competencia-no-signal/);
  assert.match(sqlTest, /recepcao nao tem acesso ao Financeiro/);
  assert.match(sqlTest, /atendimento gratuito nao inventa receita/);
});
