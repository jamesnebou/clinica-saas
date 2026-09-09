import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260908130000_demo_snapshot_generated_columns_fix.sql", import.meta.url),
  "utf8",
);

test("restore da Demo usa colunas explicitas e ignora generated columns", () => {
  assert.match(migration, /create or replace function public\.restore_clinica_demo_snapshot/);
  assert.match(migration, /attribute\.attgenerated = ''/);
  assert.match(migration, /attribute\.attidentity <> 'a'/);
  assert.match(migration, /insert into public\.%1\$I \(%2\$s\) select %3\$s/);
  assert.doesNotMatch(migration, /insert into public\.%I select \*/);
});

test("restore valida tenant antes de excluir dados", () => {
  const validation = migration.indexOf("Snapshot contem dados de outro tenant");
  const deletion = migration.indexOf("foreach v_table in array v_delete_order");

  assert.ok(validation >= 0);
  assert.ok(deletion > validation);
  assert.match(migration, /v_clinic\.id is distinct from p_clinica_id/);
  assert.match(migration, /row_data ->> 'clinica_id'.*p_clinica_id::text/s);
});

test("restore preserva IDs e identity BY DEFAULT", () => {
  assert.match(migration, /attribute\.attidentity <> 'a'/);
  assert.doesNotMatch(migration, /attribute\.attidentity = ''/);
  assert.match(migration, /row_data \? attribute\.attname/);
  assert.match(migration, /Restore incompleto em/);
});
