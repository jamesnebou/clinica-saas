import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { isCronAuthorizationValid } from "../src/lib/cron/auth-core.mjs";
import { workerHttpResult } from "../src/lib/cron/result.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const routes = [
  "src/app/api/cron/automations/route.js",
  "src/app/api/cron/notifications/route.js",
  "src/app/api/cron/meta-capi/route.js",
  "src/app/api/cron/finance-recurring/route.js",
  "src/app/api/cron/store-expirations/route.js",
];

const workflows = [
  ".github/workflows/automations-cron.yml",
  ".github/workflows/meta-capi-cron.yml",
  ".github/workflows/operational-workers-cron.yml",
];

test("CRON_SECRET ausente ou incorreto falha fechado", () => {
  assert.equal(isCronAuthorizationValid("Bearer configured", ""), false);
  assert.equal(isCronAuthorizationValid("Bearer configured", "   "), false);
  assert.equal(isCronAuthorizationValid("Bearer wrong", "configured"), false);
  assert.equal(isCronAuthorizationValid("configured", "configured"), false);
  assert.equal(isCronAuthorizationValid("Bearer configured", "configured"), true);
});

test("todos os cron handlers usam um único helper server-only", () => {
  const helper = read("src/lib/cron/auth.js");
  assert.match(helper, /import "server-only"/);
  assert.match(helper, /process\.env\.CRON_SECRET/);
  assert.match(helper, /status: 401/);
  assert.doesNotMatch(helper, /console\.(log|info|error)/);

  for (const file of routes) {
    const source = read(file);
    assert.match(source, /isCronRequestAuthorized/);
    assert.match(source, /cronUnauthorizedResponse/);
    assert.doesNotMatch(source, /process\.env\.CRON_SECRET/);
  }
});

test("lote saudável retorna 200 e ok=true", () => {
  const response = workerHttpResult({ processed: 2, succeeded: 2, skipped: 0, retryScheduled: 0, failed: 0, dead: 0 });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.partial, false);
});

test("falha parcial com retry gera 422 e não parece saudável", () => {
  const response = workerHttpResult({ processed: 3, succeeded: 1, skipped: 1, retryScheduled: 1, failed: 0, dead: 0 });
  assert.equal(response.status, 422);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.partial, true);
});

test("falha permanente por item gera 422 e lote só com skips continua saudável", () => {
  const permanent = workerHttpResult({ processed: 1, succeeded: 0, skipped: 0, retryScheduled: 0, failed: 0, dead: 1 });
  assert.equal(permanent.status, 422);
  assert.equal(permanent.body.ok, false);
  assert.equal(permanent.body.partial, false);

  const skipped = workerHttpResult({ processed: 2, succeeded: 0, skipped: 2, retryScheduled: 0, failed: 0, dead: 0 });
  assert.equal(skipped.status, 200);
  assert.equal(skipped.body.ok, true);
});

test("rotas com lote tratam a sinalização HTTP comum", () => {
  for (const file of routes.slice(0, 3)) {
    const source = read(file);
    assert.match(source, /workerHttpResult\(result\)/);
    assert.match(source, /status: response\.status/);
  }
});

test("workflows falham fechados sem URL e bloqueiam dispatch fora de main", () => {
  for (const file of workflows) {
    const source = read(file);
    assert.match(source, /environment: production/);
    assert.match(source, /PRODUCTION_APP_URL: \$\{\{ vars\.PRODUCTION_APP_URL \}\}/);
    assert.match(source, /CRON_SECRET: \$\{\{ secrets\.PRODUCTION_CRON_SECRET \}\}/);
    assert.doesNotMatch(source, /secrets\.CRON_SECRET/);
    assert.match(source, /test -n "\$\{PRODUCTION_APP_URL\}"/);
    assert.match(source, /EVENT_NAME.*workflow_dispatch/);
    assert.match(source, /EVENT_REF.*refs\/heads\/main/);
    assert.match(source, /PRODUCTION_APP_URL%\/.*https:\/\/clinicas\.nexawi\.com\.br/);
    assert.doesNotMatch(source, /https:\/\/clinicas\.nexawi\.com\.br\/api\/cron/);
  }
});

test("Meta CAPI possui o mesmo hardening de transporte dos demais schedulers", () => {
  const source = read(".github/workflows/meta-capi-cron.yml");
  assert.match(source, /concurrency:[\s\S]*meta-capi-worker-production/);
  assert.match(source, /--connect-timeout 10/);
  assert.match(source, /--max-time 50/);
  assert.match(source, /--retry-max-time 150/);
  assert.match(source, /curl --fail-with-body/);
});

test("contadores públicos não incluem PII nem conteúdo operacional", () => {
  const response = workerHttpResult({ processed: 1, succeeded: 1, skipped: 0, retryScheduled: 0, failed: 0, dead: 0 });
  assert.deepEqual(Object.keys(response.body).sort(), ["dead", "failed", "ok", "partial", "processed", "retryScheduled", "skipped", "succeeded"].sort());
});
