import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const foundationPath = new URL("../supabase/migrations/20260825100000_multisegmento_bi_foundation.sql", import.meta.url);
const aggregationsPath = new URL("../supabase/migrations/20260825103000_bi_aggregations.sql", import.meta.url);

test("migrations do BI mantêm RLS e validação explícita de tenant", async () => {
  const [foundation, aggregations] = await Promise.all([readFile(foundationPath, "utf8"), readFile(aggregationsPath, "utf8")]);
  for (const table of ["clinica_segmentos", "clinica_capability_overrides", "metas_clinica", "eventos_analiticos", "auditoria_clinica"]) {
    assert.match(foundation, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(foundation, /usuario_pode_bi_clinica\(clinica_id\)/i);
  assert.match(foundation, /clinica_tem_capability_bi/i);
  assert.match(foundation, /clinica_capability_overrides/i);
  assert.match(aggregations, /security invoker/i);
  assert.match(aggregations, /if not app_private\.usuario_pode_bi_clinica\(p_clinica_id\)/i);
  assert.match(aggregations, /or not app_private\.clinica_tem_capability_bi\(p_clinica_id\)/i);
  assert.match(aggregations, /where a\.clinica_id = p_clinica_id/i);
  assert.match(
    aggregations,
    /grant execute on function public\.bi_resumo_clinica\(uuid, timestamptz, timestamptz, timestamptz, timestamptz, text, uuid, uuid, text, text, text, text, text, text\) to authenticated/i,
  );
  assert.doesNotMatch(aggregations, /security definer/i);
});
