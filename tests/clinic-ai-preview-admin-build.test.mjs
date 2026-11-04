import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runPreviewAdminCredentialCheck } from "../scripts/verify-ai-preview-admin.mjs";

const valid = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "feat/ai-summary-alpha-next164",
  NEXT_PUBLIC_SUPABASE_URL: "https://ojmszqqxnvmvudhzzzgo.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "mock-admin-secret",
};

async function check(env, adminResult = true) {
  const calls = [];
  const logs = [];
  const ok = await runPreviewAdminCredentialCheck({ env, log: (line) => logs.push(line),
    checkAdmin: async (url, key) => { calls.push({ url, key }); return adminResult; } });
  return { ok, calls, logs };
}

test("authorized preview checks the configured key exactly once and logs only PASS", async () => {
  const result = await check(valid);
  assert.equal(result.ok, true);
  assert.deepEqual(result.calls, [{ url: valid.NEXT_PUBLIC_SUPABASE_URL, key: valid.SUPABASE_SERVICE_ROLE_KEY }]);
  assert.deepEqual(result.logs, ["STAGING_ADMIN_CREDENTIAL_CHECK: PASS"]);
  assert.equal(JSON.stringify(result.logs).includes(valid.SUPABASE_SERVICE_ROLE_KEY), false);
});

test("rejected admin credential fails without exposing provider data", async () => {
  const result = await check(valid, false);
  assert.equal(result.ok, false);
  assert.equal(result.calls.length, 1);
  assert.deepEqual(result.logs, ["STAGING_ADMIN_CREDENTIAL_CHECK: FAIL"]);
});

test("production URL or override, missing key, wrong branch and missing branch fail before admin call", async () => {
  const invalid = [
    { ...valid, NEXT_PUBLIC_SUPABASE_URL: "https://sitoiwxalwfybcqivutd.supabase.co" },
    { ...valid, SUPABASE_URL: "https://sitoiwxalwfybcqivutd.supabase.co" },
    { ...valid, SUPABASE_SERVICE_ROLE_KEY: undefined },
    { ...valid, VERCEL_GIT_COMMIT_REF: "main" },
    { ...valid, VERCEL_GIT_COMMIT_REF: undefined },
  ];
  for (const env of invalid) {
    const result = await check(env);
    assert.equal(result.ok, false);
    assert.equal(result.calls.length, 0);
    assert.deepEqual(result.logs, ["STAGING_ADMIN_CREDENTIAL_CHECK: FAIL"]);
  }
});

test("production and local builds never use the administrative key", async () => {
  for (const environment of ["production", undefined]) {
    const result = await check({ ...valid, VERCEL_ENV: environment });
    assert.equal(result.ok, true);
    assert.equal(result.calls.length, 0);
    assert.deepEqual(result.logs, []);
  }
});

test("network failure fails closed and does not log the exception", async () => {
  const logs = [];
  let calls = 0;
  const ok = await runPreviewAdminCredentialCheck({ env: valid, log: (line) => logs.push(line),
    checkAdmin: async () => { calls += 1; throw new Error("provider detail mock-admin-secret"); } });
  assert.equal(ok, false);
  assert.equal(calls, 1);
  assert.deepEqual(logs, ["STAGING_ADMIN_CREDENTIAL_CHECK: FAIL"]);
});

test("the build script runs the verifier before Next.js", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts.build, "node scripts/verify-ai-preview-admin.mjs && next build");
});
