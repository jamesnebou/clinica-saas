import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PUBLIC_RATE_LIMIT_MESSAGE,
  PUBLIC_RATE_LIMIT_POLICIES,
  isUuid,
  isValidPublicSlug,
  looksLikeAutomatedForm,
  publicRateLimitResponseDescriptor,
  readBoundedJson,
  safePublicOriginMetadata,
} from "../src/lib/security/public-antiabuse-core.mjs";
import {
  consumePublicRateLimitRuntime as consumePublicRateLimit,
  hashPublicRateLimitValue,
  trustedPublicRequestIp,
} from "../src/lib/security/public-antiabuse-runtime.mjs";

const ROOT = new URL("../", import.meta.url);
process.env.NODE_ENV = "test";
const source = (path) => readFileSync(new URL(path, ROOT), "utf8");

function fakeLimiter() {
  const counts = new Map();
  const calls = [];
  return {
    calls,
    async rpc(_name, args) {
      calls.push(args);
      const key = [args.p_scope, args.p_tenant_key, args.p_subject_hash].join("|");
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      return { data: [{ allowed: count <= args.p_limit, retry_after: 60, current_count: count }], error: null };
    },
  };
}

const requestHeaders = (ip = "203.0.113.10") => new Headers({ "x-forwarded-for": ip });

test("1. usuário normal abaixo do limite é permitido", async () => {
  const result = await consumePublicRateLimit({ scope: "booking_create", headers: requestHeaders(), tenantId: "tenant-a", target: "5511999999999", supabase: fakeLimiter() });
  assert.equal(result.allowed, true);
});

test("2. usuário acima do limite recebe bloqueio", async () => {
  const supabase = fakeLimiter();
  let result;
  for (let index = 0; index < 7; index += 1) result = await consumePublicRateLimit({ scope: "booking_create", headers: requestHeaders(), tenantId: "tenant-a", supabase });
  assert.equal(result.allowed, false);
  assert.equal(result.limited, true);
});

test("3. resposta 429 inclui Retry-After", async () => {
  const response = publicRateLimitResponseDescriptor({ limited: true, retryAfter: 42 });
  assert.equal(response.status, 429);
  assert.equal(response.headers["Retry-After"], "42");
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("4. tenants usam buckets independentes", async () => {
  const supabase = fakeLimiter();
  for (let index = 0; index < 6; index += 1) await consumePublicRateLimit({ scope: "booking_create", headers: requestHeaders(), tenantId: "tenant-a", supabase });
  const other = await consumePublicRateLimit({ scope: "booking_create", headers: requestHeaders(), tenantId: "tenant-b", supabase });
  assert.equal(other.allowed, true);
});

test("5. rotas usam buckets independentes", async () => {
  const supabase = fakeLimiter();
  for (let index = 0; index < 6; index += 1) await consumePublicRateLimit({ scope: "booking_create", headers: requestHeaders(), tenantId: "tenant-a", supabase });
  const other = await consumePublicRateLimit({ scope: "clinic_lead_create", headers: requestHeaders(), tenantId: "tenant-a", supabase });
  assert.equal(other.allowed, true);
});

test("6. IPs diferentes usam buckets independentes", async () => {
  const supabase = fakeLimiter();
  for (let index = 0; index < 6; index += 1) await consumePublicRateLimit({ scope: "booking_create", headers: requestHeaders("203.0.113.10"), tenantId: "tenant-a", supabase });
  const other = await consumePublicRateLimit({ scope: "booking_create", headers: requestHeaders("203.0.113.11"), tenantId: "tenant-a", supabase });
  assert.equal(other.allowed, true);
});

test("7. IP puro não é enviado ao banco", async () => {
  const supabase = fakeLimiter();
  await consumePublicRateLimit({ scope: "availability", headers: requestHeaders("203.0.113.10"), tenantId: "tenant-a", supabase });
  assert.equal(supabase.calls[0].p_subject_hash, hashPublicRateLimitValue("ip", "203.0.113.10"));
  assert.doesNotMatch(JSON.stringify(supabase.calls), /203\.0\.113\.10/);
});

test("8. flood de booking usa política restrita e fail-closed", () => {
  assert.deepEqual(PUBLIC_RATE_LIMIT_POLICIES.booking_create, { limit: 6, windowSeconds: 600, targetLimit: 3, failMode: "closed" });
});

test("9. disponibilidade continua com limite moderado e fail-open", () => {
  assert.deepEqual(PUBLIC_RATE_LIMIT_POLICIES.availability, { limit: 60, windowSeconds: 60, failMode: "open" });
  assert.match(source("src/app/api/public/availability/route.js"), /scope: "availability"/);
});

test("10. payload gigante é rejeitado com 413", async () => {
  const request = new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "x".repeat(200) }) });
  const result = await readBoundedJson(request, 64);
  assert.equal(result.status, 413);
});

test("11. IDs e slugs inválidos são rejeitados", () => {
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isValidPublicSlug("../tenant"), false);
  assert.equal(isValidPublicSlug("clinica-valida"), true);
});

test("12. tenant de booking é resolvido pelo slug e não por clinica_id do browser", () => {
  const booking = source("src/app/c/[slug]/actions.js");
  assert.match(booking, /\.eq\("slug", slug\)/);
  assert.doesNotMatch(booking, /formData\.get\("clinica_id"\)/);
});

test("13. honeypot ou envio rápido descarta o booking", () => {
  assert.equal(looksLikeAutomatedForm({ website: "spam" }), true);
  assert.equal(looksLikeAutomatedForm({ form_started_at: String(Date.now()) }), true);
  const booking = source("src/app/c/[slug]/actions.js");
  assert.ok(booking.indexOf("looksLikeAutomatedForm(formData)") < booking.indexOf("agenda_criar_agendamento_atomico_v2"));
});

test("14. retry de booking preserva RPC atômica e idempotência", () => {
  const booking = source("src/app/c/[slug]/actions.js");
  assert.match(booking, /agenda_criar_agendamento_atomico_v2/);
  assert.match(booking, /p_idempotency_key: operationKey/);
  assert.match(booking, /booking_request_id/);
});

test("15. checkout impede pedido e cobrança duplicados", () => {
  const store = source("src/app/c/[slug]/store-actions.js");
  const migration = source("supabase/migrations/20260912100000_public_antiabuse_rate_limits.sql");
  assert.match(store, /checkout_request_id/);
  assert.ok(store.indexOf("existingOrder") < store.indexOf("criar_pedido_loja"));
  assert.match(migration, /pedidos_clinica_checkout_request_active_uidx/);
});

test("16. analytics mantém allowlist e rejeita tipo arbitrário", () => {
  const analytics = source("src/app/api/public/analytics/route.js");
  assert.match(analytics, /ALLOWED_EVENTS\.has\(eventName\)/);
  assert.doesNotMatch(analytics, /event_name:\s*body\.eventName/);
});

test("17. resposta 429 não revela dado privado", async () => {
  const response = publicRateLimitResponseDescriptor({ limited: true, retryAfter: 10 });
  const payload = response.body;
  assert.deepEqual(payload, { ok: false, error: PUBLIC_RATE_LIMIT_MESSAGE });
  assert.doesNotMatch(JSON.stringify(payload), /tenant|telefone|email|ip|limit/i);
});

test("18. headers falsos alternativos não substituem o endereço do proxy", () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.10", "client-ip": "198.51.100.2", forwarded: "for=198.51.100.3" });
  assert.equal(trustedPublicRequestIp(headers), "203.0.113.10");
});

test("19. metadados arbitrários de carrinho são reduzidos à allowlist", () => {
  assert.deepEqual(safePublicOriginMetadata({ source: "site", token: "secret", nested: { nope: true } }), { source: "site" });
});

test("20. falha do limiter fecha writes e abre apenas reads configuradas", async () => {
  const unavailable = { async rpc() { return { data: null, error: { code: "DB_DOWN" } }; } };
  const write = await consumePublicRateLimit({ scope: "store_order_create", headers: requestHeaders(), tenantId: "tenant-a", supabase: unavailable });
  const read = await consumePublicRateLimit({ scope: "availability", headers: requestHeaders(), tenantId: "tenant-a", supabase: unavailable });
  assert.equal(write.allowed, false);
  assert.equal(read.allowed, true);
});
