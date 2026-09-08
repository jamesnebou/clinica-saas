import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("workers operacionais possuem scheduler, segredo, timeout e retry", () => {
  const workflow = read(".github/workflows/operational-workers-cron.yml");
  assert.match(workflow, /cron: ["']4-59\/5 \* \* \* \*['"]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /timeout-minutes: 4/g);
  assert.match(workflow, /secrets\.CRON_SECRET/);
  assert.match(workflow, /curl --fail-with-body/);
  assert.match(workflow, /--retry 2/);
  assert.match(workflow, /\/api\/cron\/notifications/);
  assert.match(workflow, /\/api\/cron\/store-expirations/);
});

test("endpoints operacionais exigem CRON_SECRET e expõem somente GET", () => {
  for (const file of [
    "src/app/api/cron/notifications/route.js",
    "src/app/api/cron/store-expirations/route.js",
  ]) {
    const source = read(file);
    assert.match(source, /process\.env\.CRON_SECRET/);
    assert.match(source, /Bearer/);
    assert.match(source, /export async function GET/);
    assert.doesNotMatch(source, /export const POST\s*=/);
  }
});

test("fila WhatsApp possui claim, retry persistente e limite de tentativas", () => {
  const source = read("src/lib/whatsapp/engine.js");
  assert.match(source, /claim_domain_outbox_events/);
  assert.match(source, /claim_notification_jobs/);
  assert.match(source, /status: permanent \? "failed" : "retry"/);
  assert.match(source, /nextRetryAt/);
  assert.match(source, /max_attempts/);
  assert.match(source, /onConflict: "job_id"/);
});

test("fix-forward corrige os drifts sem editar migrations historicas", () => {
  const migration = read("supabase/migrations/20260908120000_schema_parity_operational_fix.sql");
  assert.match(migration, /whatsapp_interaction_tokens_action_check/);
  assert.match(migration, /'payment'/);
  assert.match(migration, /create or replace function public\.crm_ensure_default_pipeline/);
  assert.match(migration, /Avaliação agendada/);
  assert.match(migration, /create or replace function public\.finance_pagar_comissoes/);
  assert.match(migration, /group by profissional_id/);
});

test("migrations remotas compartilhadas possuem origem e estrategia documentadas", () => {
  const expected = [
    "20260710130000", "20260710162000", "20260710170000", "20260710171000",
    "20260710172000", "20260713140000", "20260715103000", "20260716163000",
    "20260716164500", "20260716170000", "20260717100000", "20260722143000",
    "20260722220000",
  ];
  const inventory = read("docs/database-migrations-inventory.md");
  for (const version of expected) assert.match(inventory, new RegExp(version));
  assert.match(inventory, /baseline compartilhado/i);
});

test("diagnosticos operacionais sao estritamente somente leitura", () => {
  const source = read("docs/operations-diagnostics.sql");
  assert.match(source, /finance_reconciliacao_legado_v2/);
  assert.match(source, /cliente_prontuarios/);
  assert.match(source, /domain_outbox_events/);
  assert.match(source, /notification_jobs/);
  assert.doesNotMatch(source, /\b(insert|update|delete|truncate|drop|alter)\b/i);
});
