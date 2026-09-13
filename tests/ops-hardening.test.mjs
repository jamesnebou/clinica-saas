import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { backupConfig, localBenchmarkTarget, retentionArgs, stagingTarget, verifyArchive } from "../scripts/ops/core.mjs";
import { commandEnv, exportBackup, storageCatalog } from "../scripts/ops/backup-export.mjs";
import { benchmark, percentile } from "../scripts/ops/rate-limit-benchmark.mjs";
import { safeSmokeUrl, smoke, smokeConfig } from "../scripts/ops/staging-smoke.mjs";
import { backupHealth } from "../scripts/ops/backup-health.mjs";

test("OPS independent backup health rejects stale, missing and foreign snapshots", async () => {
  const now = Date.parse("2026-09-13T12:00:00Z");
  const sample = { hostname: "nexawi-export", tags: ["nexawi-ops:abcdefghijklmnopqrst"], time: "2026-09-13T03:00:00Z" };
  const run = async (_program, args) => args[0] === "snapshots" ? JSON.stringify([sample]) : "";
  const result = await backupHealth(backupEnv, { run, now });
  assert.equal(result.age_hours, 9);
  sample.time = "2026-09-01T03:00:00Z";
  await assert.rejects(backupHealth(backupEnv, { run, now }), /stale/);
  sample.tags = ["unrelated"];
  await assert.rejects(backupHealth(backupEnv, { run, now }), /missing/);
});

const sourceRef = "abcdefghijklmnopqrst";
const backupEnv = {
  OPS_BACKUP_ENABLED: "true", OPS_BACKUP_SOURCE_REF: sourceRef,
  OPS_BACKUP_CONFIRM: `READ_ONLY_EXPORT:${sourceRef}`,
  OPS_BACKUP_SUPABASE_URL: `https://${sourceRef}.supabase.co`,
  OPS_BACKUP_QUIESCENCE_ACK: "WRITES_PAUSED_EXTERNALLY",
  OPS_BACKUP_SECURE_SCRATCH_ACK: "EPHEMERAL_ENCRYPTED_VOLUME",
  OPS_BACKUP_SCRATCH: os.tmpdir(), OPS_BACKUP_DESTINATION_HOST: "backup.example.test",
  PGHOST: `db.${sourceRef}.supabase.co`, PGPORT: "5432", PGDATABASE: "postgres",
  PGSSLMODE: "verify-full", PGSSLROOTCERT: "/fixture/ca.crt", PGUSER: "exporter",
  PGPASSWORD: "fixture-not-a-secret", OPS_BACKUP_SERVICE_ROLE_KEY: "fixture-not-a-secret",
  RESTIC_REPOSITORY: "s3:https://backup.example.test/isolated-fixture",
  RESTIC_PASSWORD: "fixture-not-a-secret", AWS_ACCESS_KEY_ID: "fixture", AWS_SECRET_ACCESS_KEY: "fixture",
};
const smokeEnv = {
  STAGING_BASE_URL: "https://staging.clinicas.nexawi.com.br",
  OPS_STAGING_CONFIRM: "STAGING:ojmszqqxnvmvudhzzzgo",
  STAGING_DEMO_SLUG: "clinica-demo", OPS_DEMO_CONFIRM: "DEMO:clinica-demo",
  STAGING_DEMO_PROCEDURE_ID: "11111111-1111-4111-8111-111111111111",
  STAGING_SMOKE_DATE: "2026-09-20",
};
const localEnv = { OPS_LOCAL_SUPABASE_URL: "http://127.0.0.1:55421", OPS_LOCAL_CONFIRM: "LOCAL:clinica-estetica", OPS_LOCAL_SERVICE_ROLE_KEY: "fixture" };
async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "nexawi-ops-test-"));
  t.after(async () => {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith("nexawi-ops-test-"));
    await rm(resolved, { recursive: true, force: true });
  });
  return root;
}
function storageFixture({ failDownload = false, changed = false } = {}) {
  let catalogs = 0;
  const buckets = [{ id: "cliente-fotos", public: false }, { id: "clinica-logos", public: true }, { id: "clinica-site-images", public: true }];
  return { storage: {
    listBuckets: async () => { catalogs++; return { data: buckets }; },
    from: (bucket) => ({
      list: async () => ({ data: bucket === "cliente-fotos" ? [{ id: "fixture", name: "opaque-private-fixture.png", updated_at: changed && catalogs > 1 ? "changed" : "same", metadata: { size: 3, mimetype: "image/png" } }] : [] }),
      download: async () => failDownload ? { error: {} } : { data: new Blob(["abc"]) },
    }),
  } };
}
async function exportFixture(t, settings = {}) {
  const scratch = await temporary(t);
  const calls = [];
  let archive;
  const run = async (program, args, options) => {
    calls.push({ program, args, options });
    if (program === "pg_dump" || program === "pg_dumpall") {
      const filename = args[args.indexOf("--file") + 1];
      archive = path.dirname(filename);
      await writeFile(filename, "synthetic fixture only");
      return "";
    }
    if (args[0] === "backup") return JSON.stringify({ message_type: "summary", snapshot_id: "a".repeat(64) });
    if (args[0] === "snapshots") return JSON.stringify([{ id: "a".repeat(64) }]);
    return "";
  };
  const result = await exportBackup({ ...backupEnv, OPS_BACKUP_SCRATCH: scratch }, {
    run, clientFactory: () => storageFixture(settings),
  });
  return { result, calls, archive };
}

test("OPS backup defaults fail closed before any source or command access", async () => {
  let touched = false;
  await assert.rejects(exportBackup({}, { run: () => { touched = true; }, clientFactory: () => { touched = true; } }));
  assert.equal(touched, false);
});
test("OPS backup requires explicit source, database match, TLS and secure scratch", () => {
  assert.equal(backupConfig(backupEnv).ref, sourceRef);
  for (const override of [
    { OPS_BACKUP_CONFIRM: "wrong" }, { PGHOST: "other.supabase.co" }, { PGSSLMODE: "require" },
    { OPS_BACKUP_SUPABASE_URL: "https://other.supabase.co" }, { OPS_BACKUP_QUIESCENCE_ACK: "" },
    { OPS_BACKUP_SECURE_SCRATCH_ACK: "" }, { OPS_BACKUP_SERVICE_ROLE_KEY: "" },
    { RESTIC_REPOSITORY: "s3:http://backup.example.test/fixture" },
    { RESTIC_REPOSITORY: "s3:https://user:password@backup.example.test/fixture" },
    { RESTIC_REPOSITORY: "s3:https://other.example.test/fixture" },
  ]) assert.throws(() => backupConfig({ ...backupEnv, ...override }));
});
test("OPS PostgreSQL commands receive only scoped credentials and read-only transaction options", () => {
  const env = commandEnv({ ...backupEnv, META_TOKEN: "must-not-inherit", PGHOSTADDR: "evil", PGOPTIONS: "malicious" }, "postgres");
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/);
  assert.equal(env.PGHOSTADDR, undefined);
  assert.equal(env.META_TOKEN, undefined);
  assert.equal(env.RESTIC_PASSWORD, undefined);
  assert.equal(commandEnv(backupEnv, "restic").PGPASSWORD, undefined);
});
test("OPS external exporter includes DB, Auth archive, role definitions, physical private Storage and manifest", async (t) => {
  const { result, calls, archive } = await exportFixture(t);
  assert.equal(result.status, "export_verified");
  assert.equal(result.files, 3);
  const manifest = JSON.parse(await readFile(path.join(archive, "manifest.json"), "utf8"));
  assert.equal(manifest.files[2].storage.metadata.mimetype, "image/png");
  assert.equal(manifest.buckets[0].public, false);
  assert.ok(calls.some(({ program, args }) => program === "pg_dump" && args.includes("--format=custom")));
  assert.ok(calls.some(({ program, args }) => program === "pg_dumpall" && args.includes("--no-role-passwords")));
  assert.deepEqual(calls.at(-1).args, retentionArgs(sourceRef));
  assert.ok(!JSON.stringify(result).includes("opaque-private"));
  assert.ok(!JSON.stringify(result).includes("fixture-not-a-secret"));
  assert.deepEqual(await verifyArchive(archive), { files: result.files, bytes: result.bytes });
});
test("OPS hash verification fails on corrupted physical object", async (t) => {
  const { archive } = await exportFixture(t);
  const manifest = JSON.parse(await readFile(path.join(archive, "manifest.json"), "utf8"));
  await writeFile(path.join(archive, manifest.files[2].path), "bad");
  await assert.rejects(verifyArchive(archive), /integrity/);
});
test("OPS archive manifest rejects traversal and duplicate files", async (t) => {
  const { archive } = await exportFixture(t);
  const filename = path.join(archive, "manifest.json");
  const manifest = JSON.parse(await readFile(filename, "utf8"));
  manifest.files.push({ ...manifest.files[0] });
  await writeFile(filename, JSON.stringify(manifest));
  await assert.rejects(verifyArchive(archive), /duplicate/);
  manifest.files.at(-1).path = "../secret";
  await writeFile(filename, JSON.stringify(manifest));
  await assert.rejects(verifyArchive(archive), /path/);
});
test("OPS backup does not publish a snapshot when download fails", async (t) => {
  await assert.rejects(exportFixture(t, { failDownload: true }), /download_failed/);
});
test("OPS backup rejects Storage changes during database/object export", async (t) => {
  await assert.rejects(exportFixture(t, { changed: true }), /changed_during_export/);
});
test("OPS catalog paginates nested files and includes additional buckets", async () => {
  const buckets = ["cliente-fotos", "clinica-logos", "clinica-site-images", "additional",
    ...Array.from({ length: 97 }, (_, index) => `extra-${index}`)].map((id) => ({ id, public: false }));
  const pages = [];
  const bucketPages = [];
  const client = { storage: { listBuckets: async ({ offset, limit }) => {
    bucketPages.push(offset);
    return { data: buckets.slice(offset, offset + limit) };
  }, from: (bucket) => ({
    list: async (prefix, options) => {
      pages.push([bucket, prefix, options.offset]);
      if (bucket !== "additional") return { data: [] };
      if (!prefix) return { data: [{ name: "folder", id: null }] };
      return { data: options.offset ? [{ name: "last", id: "last" }] : Array.from({ length: 100 }, (_, index) => ({ name: String(index), id: String(index) })) };
    },
  }) } };
  const catalog = await storageCatalog(client);
  assert.equal(catalog.objects.length, 101);
  assert.equal(catalog.buckets.length, 101);
  assert.deepEqual(bucketPages, [0, 100]);
  assert.ok(pages.some((page) => page[1] === "folder" && page[2] === 100));
});
test("OPS catalog fails closed for missing/private bucket and object cap", async () => {
  await assert.rejects(storageCatalog({ storage: { listBuckets: async () => ({ data: [] }) } }), /required_bucket/);
  await assert.rejects(storageCatalog(storageFixture(), 0), /catalog_limit/);
  const client = storageFixture();
  client.storage.listBuckets = async () => ({ data: ["cliente-fotos", "clinica-logos", "clinica-site-images"].map((id) => ({ id, public: true })) });
  await assert.rejects(storageCatalog(client), /private_bucket/);
});
test("OPS retention is a scoped dry-run, never prune or automatic deletion", () => {
  const args = retentionArgs(sourceRef);
  assert.ok(args.includes("--dry-run"));
  assert.ok(!args.includes("--prune"));
  assert.ok(args.includes(`nexawi-ops:${sourceRef}`));
  assert.throws(() => retentionArgs("--all"));
});
test("OPS staging guard blocks Production, arbitrary Preview, userinfo and URL payloads", () => {
  assert.equal(stagingTarget(smokeEnv), smokeEnv.STAGING_BASE_URL);
  for (const base of ["https://clinicas.nexawi.com.br", "https://ingridestetica.com.br", "https://arbitrary.vercel.app", smokeEnv.STAGING_BASE_URL + "/?next=evil", "https://user:pass@staging.clinicas.nexawi.com.br"]) {
    assert.throws(() => stagingTarget({ ...smokeEnv, STAGING_BASE_URL: base }));
  }
  assert.throws(() => smokeConfig({ ...smokeEnv, OPS_DEMO_CONFIRM: "wrong" }));
});
test("OPS smoke rejects redirects to gateways, Production, auth/signups and arbitrary endpoints", () => {
  const config = smokeConfig(smokeEnv);
  for (const url of ["https://clinicas.nexawi.com.br", "https://asaas.com", "/cadastro", "/checkout", "/api/public/store/orders", "/demo"]) assert.throws(() => safeSmokeUrl(config, url));
});
function smokeTransport(calls, { rate = false, redirect = false, failHeaders = false } = {}) {
  let posts = 0;
  return async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    if (redirect && parsed.pathname === "/") return new Response(null, { status: 302, headers: { location: "https://clinicas.nexawi.com.br/" } });
    if (parsed.pathname === "/demo") return new Response(null, { status: 307, headers: { location: "/dashboard?tour=1", "set-cookie": "fixture-session=yes; HttpOnly; Secure" } });
    let status = 200;
    let body = "<html>fixture</html>";
    if (parsed.pathname.endsWith("availability")) body = JSON.stringify({ slots: [] });
    if (options.method === "POST") {
      posts++;
      assert.deepEqual(Object.keys(JSON.parse(options.body)), options.body.length > 65_536 ? ["padding"] : ["eventName"]);
      status = options.body.length > 65_536 ? 413 : (rate && posts > 60 ? 429 : 400);
      body = "{}";
    }
    return new Response(body, { status, headers: { ...(failHeaders ? {} : { "cache-control": "no-store" }), ...(status === 429 ? { "retry-after": "30" } : {}) } });
  };
}
test("OPS smoke happy path uses only GET and invalid analytics; optional resets/probes are off", async () => {
  const calls = [];
  const results = await smoke(smokeEnv, { fetchImpl: smokeTransport(calls) });
  assert.equal(results.filter((item) => item.status === "PASS").length, 5);
  assert.equal(results.filter((item) => item.status === "SKIPPED").length, 2);
  assert.ok(calls.every(({ url, options }) => options.redirect === "manual" && url.startsWith(smokeEnv.STAGING_BASE_URL)));
  assert.ok(!calls.some(({ url }) => url.includes("/demo")));
});
test("OPS smoke explicit Demo opt-in follows dashboard using cookies without external navigation", async () => {
  const calls = [];
  const result = await smoke({ ...smokeEnv, STAGING_SMOKE_DEMO_LOGIN: "true" }, { fetchImpl: smokeTransport(calls) });
  assert.equal(result.find((item) => item.name === "demo_login").status, "PASS");
  assert.match(calls.find(({ url }) => url.includes("/dashboard")).options.headers.Cookie, /fixture-session/);
});
test("OPS smoke observes 429/Retry-After and no-store with bounded invalid-only probe", async () => {
  const calls = [];
  const results = await smoke({ ...smokeEnv, STAGING_SMOKE_RATE_PROBE: "true" }, { fetchImpl: smokeTransport(calls, { rate: true }) });
  assert.equal(results.at(-1).status, "PASS");
  assert.ok(calls.length < 72);
});
test("OPS smoke reports failure when 429 is not observed instead of claiming PASS", async () => {
  const results = await smoke({ ...smokeEnv, STAGING_SMOKE_RATE_PROBE: "true" }, { fetchImpl: smokeTransport([]) });
  assert.equal(results.at(-1).status, "FAIL");
});
test("OPS smoke blocks external redirect before a second request and checks cache headers", async () => {
  const calls = [];
  await assert.rejects(smoke(smokeEnv, { fetchImpl: smokeTransport(calls, { redirect: true }) }), /destination_blocked/);
  assert.equal(calls.length, 1);
  await assert.rejects(smoke(smokeEnv, { fetchImpl: smokeTransport([], { failHeaders: true }) }), /assertion_failed/);
});
test("OPS benchmark rejects every non-local destination before SQL, secrets or fetch", async () => {
  let calls = 0;
  for (const url of ["https://ojmszqqxnvmvudhzzzgo.supabase.co", "http://localhost:55421", "http://127.0.0.1:54321", "http://user:pass@127.0.0.1:55421"]) {
    await assert.rejects(benchmark({ ...localEnv, OPS_LOCAL_SUPABASE_URL: url }, { sql: () => calls++, fetchImpl: () => calls++ }));
  }
  assert.equal(calls, 0);
  assert.equal(localBenchmarkTarget(localEnv), localEnv.OPS_LOCAL_SUPABASE_URL);
});
test("OPS benchmark measures counts, percentiles, table growth and caps concurrency", async () => {
  let active = 0, maximum = 0, sqlCount = 0;
  const result = await benchmark({ ...localEnv, OPS_BENCH_REQUESTS: "20", OPS_BENCH_CONCURRENCY: "3" }, {
    sql: () => (++sqlCount <= 2 ? JSON.stringify({ rows: sqlCount * 20, relation_bytes: sqlCount * 8192 }) : "20"),
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, "error");
      assert.match(JSON.parse(options.body).p_scope, /^opsbench:/);
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return Response.json([{ allowed: true }]);
    },
  });
  assert.equal(result.errors, 0);
  assert.equal(result.row_delta, 20);
  assert.equal(result.relation_bytes_delta, 8192);
  assert.equal(maximum, 3);
  assert.ok(result.p99_ms >= result.p50_ms && result.requests_per_second > 0);
  assert.equal(percentile([1, 2, 3, 4], 0.95), 4);
  await assert.rejects(benchmark({ ...localEnv, OPS_BENCH_CONCURRENCY: "65" }), /invalid_limit/);
});
test("OPS workflows are future-config gated, smoke manual-only, no plaintext artifacts", async () => {
  const backup = await readFile(new URL("../.github/workflows/ops-backup.yml", import.meta.url), "utf8");
  const staging = await readFile(new URL("../.github/workflows/ops-staging-smoke.yml", import.meta.url), "utf8");
  assert.match(backup, /vars.OPS_BACKUP_ENABLED == 'true'/);
  assert.match(backup, /environment: ops-backup/);
  assert.match(backup, /if: failure\(\)/);
  assert.match(staging, /workflow_dispatch:/);
  assert.doesNotMatch(staging, /schedule:/);
  assert.doesNotMatch(backup + staging, /upload-artifact|supabase db push|vercel --prod|restic init/);
});
test("OPS preserves historical DR target guards and application body limit", async () => {
  const guard = await readFile(new URL("../scripts/dr/safety.mjs", import.meta.url), "utf8");
  const config = await readFile(new URL("../next.config.mjs", import.meta.url), "utf8");
  assert.match(guard, /BLOCKED_REFS.has\(ref\)/);
  assert.match(config, /bodySizeLimit: "60mb"/);
});
