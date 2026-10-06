import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261002143705_finance_reconciliation_guard.sql", import.meta.url), "utf8");
const sqlTests = await readFile(new URL("../supabase/tests/finance_reconciliation_guard.test.sql", import.meta.url), "utf8");
const action = await readFile(new URL("../src/app/dashboard/financeiro/actions.js", import.meta.url), "utf8");
const page = await readFile(new URL("../src/app/dashboard/financeiro/conciliacao/page.js", import.meta.url), "utf8");

test("P0-03 aborts on historical duplicates before creating unique indexes", () => {
  const preflight = migration.indexOf("Duplicate reconciled liquidations require manual review");
  const index = migration.indexOf("create unique index finance_conciliacoes_liquidacao_confirmada_uidx");
  assert.ok(preflight >= 0 && index > preflight);
  assert.match(migration, /create unique index finance_conciliacoes_movimento_confirmado_uidx/);
  assert.match(migration, /where status = 'conciliado' and liquidacao_id is not null/);
});

test("P0-03 RPC derives tenant from reconciliation and verifies the signed-in member", () => {
  assert.match(migration, /finance_conciliar_liquidacao\(p_conciliacao_id uuid\)/);
  assert.doesNotMatch(migration, /finance_conciliar_liquidacao\([^)]*p_clinica_id/);
  assert.match(migration, /v_actor uuid := auth\.uid\(\)/);
  assert.match(migration, /uc\.clinica_id = v_c\.clinica_id and uc\.ativo/);
  assert.match(migration, /auth\.jwt\(\) ->> 'role' is distinct from 'authenticated'/);
  assert.match(migration, /security definer set search_path = ''/);
  assert.match(migration, /grant execute on function public\.finance_conciliar_liquidacao\(uuid\) to authenticated/);
});

test("P0-03 locks reconciliation, liquidation, movement, receivable and installments", () => {
  for (const table of ["finance_conciliacoes", "finance_liquidacoes", "finance_movimentos", "finance_recebiveis"]) {
    assert.match(migration, new RegExp(`from public\\.${table}\\s+where[^;]+for update`, "i"));
  }
  assert.match(migration, /for update of lp, p/);
});

test("P0-03 matches provider gross to liquidation gross, not receivable total or net", () => {
  assert.match(migration, /v_c\.valor_provider is distinct from v_l\.valor_bruto/);
  assert.match(migration, /v_m\.valor_liquido is distinct from v_l\.valor_liquido/);
  assert.match(migration, /v_c\.provider is distinct from v_l\.provider/);
  assert.match(migration, /v_c\.provider_reference is distinct from v_l\.provider_reference/);
  assert.doesNotMatch(migration, /v_c\.valor_provider\s*(?:=|<>|is distinct from)\s*v_r\.valor_total/);
});

test("P0-03 rejects reversals, cancelled receivables and double use", () => {
  assert.match(migration, /e\.reversao_de_id = v_l\.id/);
  assert.match(migration, /v_r\.status not in \('parcial', 'pago'\)/);
  assert.match(migration, /v_l\.conciliado/);
  assert.match(migration, /other\.status = 'conciliado'/);
  assert.match(migration, /if v_c\.status = 'conciliado' then/);
});

test("P0-03 protects direct writes but keeps non-sensitive updates and gateway RPCs", () => {
  for (const table of ["finance_conciliacoes", "finance_liquidacoes", "finance_movimentos"]) {
    assert.match(migration, new RegExp(`create trigger ${table}_proteger_direto`));
  }
  assert.match(migration, /current_user not in \('authenticated', 'anon'\)/);
  assert.match(migration, /revoke insert on public\.finance_liquidacoes, public\.finance_movimentos from authenticated/);
  assert.match(sqlTests, /UPDATE não sensível continua permitido/);
  assert.match(sqlTests, /Registrar recebimento manual continua funcionando sem provider/);
  assert.match(action, /supabase\.rpc\("finance_conciliar_liquidacao"/);
  assert.doesNotMatch(action, /from\("finance_conciliacoes"\)\.update/);
  assert.match(page, /row\.status !== "pendente"/);
});

test("P0-03 records audit and SQL cases for the financial failure modes", () => {
  assert.match(migration, /financeiro\.liquidacao_conciliada/);
  for (const scenario of ["valor bruto divergente", "provider divergente", "referência divergente", "clínica A", "estornada", "cancelado", "sem liquidação", "usuário sem permissão", "UPDATE direto"]) {
    assert.ok(sqlTests.includes(scenario), `Missing SQL scenario: ${scenario}`);
  }
});

test("P0-03 concurrency contract permits one winner for two simultaneous requests", () => {
  // Both requests lock the same liquidation row; the second then sees conciliado=true.
  // The unique indexes remain a database-level backstop if two rows race.
  assert.match(migration, /where id = v_c\.liquidacao_id and clinica_id = v_c\.clinica_id for update/);
  assert.match(migration, /v_l\.conciliado then/);
  assert.match(migration, /create unique index finance_conciliacoes_liquidacao_confirmada_uidx/);
  assert.match(migration, /create unique index finance_conciliacoes_movimento_confirmado_uidx/);
});
