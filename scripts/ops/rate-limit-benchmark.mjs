import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { integer, localBenchmarkTarget, mainModule, requireValue } from "./core.mjs";

const CONTAINER = "supabase_db_clinica-estetica";
export function localSql(sql) {
  try {
    return execFileSync("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000, windowsHide: true }).trim();
  } catch {
    throw new Error("ops_local_database_unavailable");
  }
}

export function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

export async function benchmark(env, { fetchImpl = fetch, sql = localSql } = {}) {
  const origin = localBenchmarkTarget(env);
  const key = requireValue(env, "OPS_LOCAL_SERVICE_ROLE_KEY");
  const requests = integer(env.OPS_BENCH_REQUESTS, 300, 1, 10_000);
  const concurrency = integer(env.OPS_BENCH_CONCURRENCY, 8, 1, 64);
  const profile = env.OPS_BENCH_PROFILE || "distributed";
  if (!["hot", "distributed"].includes(profile)) throw new Error("ops_invalid_profile");
  const scope = `opsbench:${randomUUID().replaceAll("-", "")}`;
  const stats = () => JSON.parse(sql(`select json_build_object('rows', count(*), 'relation_bytes', pg_total_relation_size('public.public_rate_limit_buckets')) from public.public_rate_limit_buckets`));
  const before = stats();
  const latencies = [];
  let cursor = 0, errors = 0, denied = 0;
  const start = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < requests) {
      const index = cursor++;
      const tick = performance.now();
      try {
        const response = await fetchImpl(`${origin}/rest/v1/rpc/consume_public_rate_limit`, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
          headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            p_scope: scope, p_tenant_key: profile === "hot" ? "local-fixture" : `local-fixture-${index % 10}`,
            p_subject_hash: createHash("sha256").update(profile === "hot" ? scope : `${scope}:${index}`).digest("hex"),
            p_limit: 10_000, p_window_seconds: 600,
          }),
        });
        if (!response.ok) throw new Error("ops_rpc_failed");
        const rows = await response.json();
        if (typeof rows[0]?.allowed !== "boolean") throw new Error("ops_invalid_rpc_result");
        if (!rows[0].allowed) denied++;
      } catch { errors++; }
      latencies.push(performance.now() - tick);
    }
  }));
  const seconds = (performance.now() - start) / 1000;
  const after = stats();
  const fixtureRows = Number(sql(`select count(*) from public.public_rate_limit_buckets where scope = '${scope}'`));
  latencies.sort((a, b) => a - b);
  return {
    profile, requests, concurrency, errors, denied, seconds, requests_per_second: requests / seconds,
    latency_includes_errors: true,
    p50_ms: percentile(latencies, 0.50), p95_ms: percentile(latencies, 0.95), p99_ms: percentile(latencies, 0.99),
    before, after, fixture_rows: fixtureRows, row_delta: after.rows - before.rows,
    relation_bytes_delta: after.relation_bytes - before.relation_bytes,
    environment: "loopback-only; HTTP/PostgREST/RPC; not Vercel capacity",
  };
}

if (mainModule(import.meta.url)) {
  benchmark(process.env).then((result) => {
    console.log(JSON.stringify(result));
    if (result.errors || result.denied) process.exitCode = 1;
  }).catch(() => { console.error("ops_local_benchmark_failed"); process.exitCode = 1; });
}
