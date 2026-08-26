import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrations = [
  "20260828101000_crm_2_core.sql",
  "20260828102000_crm_2_rpcs.sql",
  "20260828103000_crm_2_backfill.sql",
  "20260828104000_crm_2_hardening.sql",
  "20260828105000_crm_2_pipeline_management.sql",
  "20260828106000_crm_2_event_idempotency_fix.sql",
];

async function sql(file) {
  return readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
}

test("migrations CRM 2.0 são transacionais e não removem estrutura", async () => {
  for (const file of migrations) {
    const content = await sql(file);
    assert.match(content, /^begin;/i, file);
    assert.match(content, /commit;\s*$/i, file);
    assert.doesNotMatch(content, /drop\s+table|truncate\s/i, file);
  }
});

test("núcleo separa pipeline, etapa, oportunidade, atividade e timeline por tenant", async () => {
  const content = await sql(migrations[0]);
  for (const table of ["crm_pipelines", "crm_pipeline_stages", "crm_activities", "crm_opportunity_events", "crm_opportunity_tags", "crm_opportunity_appointments"]) {
    assert.match(content, new RegExp(table), table);
  }
  assert.match(content, /foreign key \(clinica_id,pipeline_id\)/i);
  assert.match(content, /foreign key \(clinica_id,stage_id\)/i);
  assert.match(content, /enable row level security/i);
  assert.match(content, /crm_booking_behavior in \('none','evaluation','opportunity','direct_sale'\)/i);
});

test("RPC de movimentação valida tenant, trava registro e emite eventos", async () => {
  const content = await sql(migrations[1]);
  assert.match(content, /crm_move_opportunity/);
  assert.match(content, /for update/);
  assert.match(content, /crm_opportunity_events/);
  assert.match(content, /domain_outbox_events/);
  assert.match(content, /crm_complete_activity/);
  assert.match(content, /crm_pipeline_metrics/);
});

test("emissão de eventos usa a constraint parcial de idempotência por clínica", async () => {
  const [base, fix] = await Promise.all([sql(migrations[1]), sql(migrations[5])]);
  for (const content of [base, fix]) {
    assert.match(content, /on conflict\s*\(clinica_id\s*,\s*idempotency_key\s*\)\s*where idempotency_key is not null\s*do nothing/i);
  }
});

test("backfill preserva compatibilidade e hardening limita a limpeza à demo", async () => {
  const backfill = await sql(migrations[2]);
  const hardening = await sql(migrations[3]);
  assert.match(backfill, /crm_ensure_default_pipeline/);
  assert.match(backfill, /avaliacao_marcada/);
  assert.match(hardening, /telefone_normalizado/);
  assert.match(hardening, /crm_possible_duplicates/);
  assert.match(hardening, /crm_validate_opportunity_tenant/);
  assert.match(hardening, /slug='demo-nexawi-clinicas'/);
  assert.doesNotMatch(hardening, /delete\s+from\s+public\.demo_account_snapshots\s*;/i);
});

test("gestão de pipelines cria etapas e troca o padrão sem conflito", async () => {
  const content = await sql(migrations[4]);
  assert.match(content, /crm_create_pipeline/);
  assert.match(content, /crm_set_default_pipeline/);
  assert.match(content, /evaluation_scheduled/);
  assert.match(content, /update public\.crm_pipelines set padrao = false/i);
  assert.match(content, /update public\.crm_pipelines set padrao = true/i);
});
