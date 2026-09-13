import { mainModule, stagingTarget } from "./core.mjs";

export function smokeConfig(env) {
  const origin = stagingTarget(env);
  const slug = env.STAGING_DEMO_SLUG;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug || "") || env.OPS_DEMO_CONFIRM !== `DEMO:${slug}`) throw new Error("ops_demo_confirmation_required");
  const procedure = env.STAGING_DEMO_PROCEDURE_ID;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(procedure || "")) throw new Error("ops_demo_procedure_required");
  const date = env.STAGING_SMOKE_DATE;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("ops_smoke_date_required");
  return { origin, slug, procedure, date, demoLogin: env.STAGING_SMOKE_DEMO_LOGIN === "true", rateProbe: env.STAGING_SMOKE_RATE_PROBE === "true" };
}

export function safeSmokeUrl(config, input) {
  const url = new URL(input, config.origin);
  const paths = ["/", `/c/${config.slug}`, "/api/public/availability", "/api/public/analytics"];
  if (config.demoLogin) paths.push("/demo", "/dashboard");
  if (url.origin !== config.origin || url.username || url.password || url.hash || !paths.includes(url.pathname)) throw new Error("ops_smoke_destination_blocked");
  return url;
}

export async function smoke(env, { fetchImpl = fetch, report = () => {} } = {}) {
  const config = smokeConfig(env);
  const cookies = new Map();
  const results = [];
  const record = (name, status, details = {}) => {
    const result = { name, status, ...details };
    results.push(result);
    report(result);
  };
  async function request(input, { body } = {}) {
    let url = safeSmokeUrl(config, input);
    const method = body === undefined ? "GET" : "POST";
    if (method === "POST" && url.pathname !== "/api/public/analytics") throw new Error("ops_smoke_write_blocked");
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await fetchImpl(url.href, {
        method, body, redirect: "manual", signal: AbortSignal.timeout(20_000),
        headers: {
          "User-Agent": "NexaWi-Staging-Smoke/1",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") } : {}),
        },
      });
      for (const line of response.headers.getSetCookie?.() || []) {
        const pair = line.split(";")[0];
        const equals = pair.indexOf("=");
        if (equals > 0) cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (method !== "GET" || !location) throw new Error("ops_smoke_redirect_blocked");
        url = safeSmokeUrl(config, new URL(location, url).href);
        continue;
      }
      return { response, url };
    }
    throw new Error("ops_smoke_redirect_limit");
  }
  async function check(name, input, expected, options = {}) {
    const { response, url } = await request(input, options);
    let ok = response.status === expected;
    if (options.noStore) ok &&= /no-store/i.test(response.headers.get("cache-control") || "");
    if (options.finalPath) ok &&= url.pathname === options.finalPath;
    if (options.slots && response.ok) {
      const data = await response.json();
      ok &&= Array.isArray(data.slots);
    } else await response.body?.cancel();
    record(name, ok ? "PASS" : "FAIL", { http_status: response.status });
    if (!ok) throw new Error("ops_smoke_assertion_failed");
  }
  await check("home", "/", 200);
  if (config.demoLogin) await check("demo_login", "/demo", 200, { finalPath: "/dashboard" });
  else record("demo_login", "SKIPPED", { reason: "explicit_opt_in_required_resets_demo" });
  await check("demo_public", `/c/${config.slug}`, 200);
  const query = new URLSearchParams({ slug: config.slug, procedimento_id: config.procedure, date: config.date });
  await check("availability", `/api/public/availability?${query}`, 200, { noStore: true, slots: true });
  // No recognized event/PII, even if staging uses real gateway credentials.
  await check("invalid_payload", "/api/public/analytics", 400, { body: JSON.stringify({ eventName: "ops_invalid_event" }), noStore: true });
  await check("oversized_payload", "/api/public/analytics", 413, { body: JSON.stringify({ padding: "x".repeat(70_000) }), noStore: true });
  if (config.rateProbe) {
    let limited = false;
    // Exercises public_form_ingress; invalid analytics is rejected before persistence.
    for (let index = 0; index < 65; index++) {
      const { response } = await request("/api/public/analytics", { body: JSON.stringify({ eventName: "ops_invalid_event" }) });
      if (response.status === 429) {
        limited = /^[1-9]\d*$/.test(response.headers.get("retry-after") || "") && /no-store/i.test(response.headers.get("cache-control") || "");
        await response.body?.cancel();
        break;
      }
      await response.body?.cancel();
      if (response.status !== 400) throw new Error("ops_unexpected_probe_response");
    }
    record("rate_limit_and_retry_after", limited ? "PASS" : "FAIL");
  } else record("rate_limit_and_retry_after", "SKIPPED", { reason: "explicit_opt_in_required_consumes_shared_ip_budget" });
  return results;
}

if (mainModule(import.meta.url)) {
  smoke(process.env, { report: (item) => console.log(JSON.stringify(item)) }).then((results) => {
    if (results.some((item) => item.status === "FAIL")) process.exitCode = 1;
  }).catch(() => { console.error("ops_staging_smoke_failed"); process.exitCode = 1; });
}
