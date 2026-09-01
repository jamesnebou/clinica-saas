import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/automations-cron.yml", import.meta.url), "utf8");
const route = await readFile(new URL("../src/app/api/cron/automations/route.js", import.meta.url), "utf8");
const scheduler = await readFile(new URL("../src/lib/automations/scheduler.js", import.meta.url), "utf8");
const executor = await readFile(new URL("../src/lib/automations/executor.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831100000_automation_engine_operational_hardening.sql", import.meta.url), "utf8");

test("workflow executa o worker aproximadamente a cada cinco minutos e manualmente", () => {
  assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /https:\/\/clinicas\.nexawi\.com\.br\/api\/cron\/automations/);
});

test("workflow usa secret sem imprimir o valor", () => {
  assert.match(workflow, /CRON_SECRET: \$\{\{ secrets\.CRON_SECRET \}\}/);
  assert.match(workflow, /Authorization: Bearer \$\{CRON_SECRET\}/);
  assert.doesNotMatch(workflow, /echo[^\n]*\$\{CRON_SECRET\}/);
  assert.doesNotMatch(workflow, /set -x/);
});

test("workflow possui timeout, retry controlado e falha HTTP visível", () => {
  assert.match(workflow, /timeout-minutes: 4/);
  assert.match(workflow, /curl --fail-with-body/);
  assert.match(workflow, /--connect-timeout 10/);
  assert.match(workflow, /--max-time 50/);
  assert.match(workflow, /--retry 2/);
  assert.match(workflow, /--retry-max-time 150/);
});

test("concurrency impede dois workers simultâneos deste workflow", () => {
  assert.match(workflow, /concurrency:[\s\S]*group: automations-worker-production[\s\S]*cancel-in-progress: false/);
});

test("endpoint rejeita ausência de secret com 401", () => {
  assert.match(route, /if \(!authorized\(request\)\)[\s\S]*status: 401/);
  assert.match(route, /isAutomationCronAuthorized/);
});

test("endpoint autorizado retorna 200 e o resumo do worker", () => {
  assert.match(route, /await runAutomationWorker\(\{ batchSize: 25 \}\)/);
  assert.match(route, /NextResponse\.json\(\{ ok: true, \.\.\.result \}/);
});

test("worker suporta lote vazio e consome eventos waits e runs", () => {
  for (const collection of ["events", "waits", "runs"]) {
    assert.match(scheduler, new RegExp(`\\(${collection} \\|\\| \\[\\]\\)\\.length`));
    assert.match(scheduler, new RegExp(`for \\(const .* of ${collection} \\|\\| \\[\\]\\)`));
  }
  assert.match(scheduler, /processAutomationOutboxEvent\(event\)/);
  assert.match(scheduler, /resumeAutomationWait\(wait\)/);
  assert.match(scheduler, /continueAutomationRun\(run\.id\)/);
});

test("retry e SKIP LOCKED permanecem ativos", () => {
  assert.match(scheduler, /retryAutomationEvent\(event, error\)/);
  assert.match(scheduler, /status: Number\(wait\.attempts \|\| 1\) >= 5 \? "failed" : "pending"/);
  assert.match(migration, /for update skip locked/gi);
  assert.match(migration, /claim_domain_outbox_events_for_consumer/);
  assert.match(migration, /claim_automation_waits/);
  assert.match(migration, /claim_automation_runs/);
});

test("acoes high-risk continuam bloqueadas por padrao", () => {
  assert.match(executor, /process\.env\.AUTOMATION_ALLOW_HIGH_RISK_ACTIONS === "true"/);
  assert.match(executor, /HIGH_RISK_ACTION_BLOCKED/);
  assert.doesNotMatch(workflow, /AUTOMATION_ALLOW_HIGH_RISK_ACTIONS:\s*true/);
});
