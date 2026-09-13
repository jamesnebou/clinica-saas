import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as guards from "../src/lib/security/public-antiabuse-core.mjs";
import * as runtime from "../src/lib/security/public-antiabuse-runtime.mjs";
import * as schedule from "../src/lib/clinic/schedule.js";
import { totalAppointmentMinutes } from "../src/lib/domain/schedule-core.mjs";
import { getStoreConfig } from "../src/lib/store/config.js";

process.env.NODE_ENV = "test";
const id = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function load(path, name, deps) {
  const code = source(path).replace(/^import[\s\S]*?;\r?$/gm, "").replace(/^export /gm, "");
  return new Function(...Object.keys(deps), code + "\nreturn " + name)(...Object.values(deps));
}
const redirect = (url) => { throw Object.assign(new Error("redirect"), { url }); };
async function run(action, form) {
  try { await action(form); throw new Error("Expected redirect"); }
  catch (error) { if (!error.url) throw error; return error.url; }
}
function form(extra = {}) {
  const data = new FormData();
  Object.entries({
    slug: "fixture", nome: "Ficticio Teste", email: "fixture@example.test", telefone: "77999990000",
    procedimento_ids: id(3), profissional_id: id(2), data_hora: "2030-01-10T09:00",
    consentimento_lgpd: "on", booking_request_id: id(4),
    order_request_id: id(5), items_json: JSON.stringify([{ produto_id: id(3), quantidade: 1 }]),
    ...extra,
  }).forEach(([key, value]) => data.append(key, value));
  return data;
}
function harness(options = {}) {
  const state = { bookings: 0, orders: 0, charges: 0, notifications: 0, reads: 0, rpc: [], operations: new Map(), orderRows: new Map(), publicRow: null };
  const clinic = { id: id(1), nome: "Fixture", slug: "fixture", metadata: { site_publico: {} } };
  const product = { id: id(3), nome: "Fixture", preco: 100, duracao_minutos: 60, sinal_valor: 50, crm_booking_behavior: "none" };
  const supabase = {
    from(table) {
      state.reads++;
      const filters = {};
      let update;
      const q = {
        select() { return q; }, in(key, values) { filters[key] = values; return q; },
        eq(key, value) { filters[key] = value; return q; },
        not() { return q; }, lt() { return q; }, gt() { return q; }, limit() { return q; },
        update(value) { update = value; return q; }, insert() { return q; }, upsert() { return q; },
        maybeSingle() { return q; }, single() { return q; },
        then(resolve, reject) {
          try {
            let data = null;
            if (table === "clinicas") data = filters.slug === clinic.slug ? clinic : null;
            if (table === "clinica_integracoes") data = { pagamento_gateway: "asaas", asaas_ativo: true };
            if (["procedimentos", "produtos_clinica"].includes(table)) data = filters.clinica_id === clinic.id && filters.id.includes(product.id) ? [product] : [];
            if (table === "agendamentos") data = [];
            if (table === "agenda_booking_operations") data = state.operations.get(filters.idempotency_key) || null;
            if (table === "site_agendamentos_publicos") {
              if (update) state.publicRow = { ...state.publicRow, ...update, id: id(6) };
              data = state.publicRow;
            }
            if (table === "clientes") data = [{ id: id(7) }];
            if (table === "pedidos_clinica") {
              data = filters["origem->>checkout_request_id"] ? state.orderRows.get(filters["origem->>checkout_request_id"]) : [...state.orderRows.values()][0];
              if (data && update) Object.assign(data, update);
            }
            resolve({ data, error: null });
          } catch (error) { reject(error); }
        },
      };
      return q;
    },
    async rpc(name, args) {
      state.rpc.push({ name, args });
      if (name === "agenda_criar_agendamento_atomico_v2") {
        assert.equal(args.p_clinica_id, clinic.id);
        if (args.p_profissional_id !== id(2)) return { error: { code: "23503" } };
        const existing = state.operations.get(args.p_idempotency_key);
        if (existing) return { data: { ...existing, idempotente: true } };
        state.bookings++;
        const result = { agendamento_id: id(8), cliente_id: id(7), public_booking_id: id(6) };
        state.operations.set(args.p_idempotency_key, result);
        state.publicRow = { id: id(6), pagamento_status: "pendente" };
        return { data: { ...result, idempotente: false } };
      }
      if (name === "criar_pedido_loja") {
        assert.equal(args.p_clinica_id, clinic.id);
        const key = args.p_origem.checkout_request_id;
        if (state.orderRows.has(key)) return { error: { code: "23505" } };
        state.orders++;
        state.orderRows.set(key, { id: id(9), token_publico: id(10), pagamento_status: "pendente" });
        return { data: [{ pedido_id: id(9), token_publico: id(10), numero: 1, total: 100 }] };
      }
      if (name === "cancelar_pedido_loja") for (const row of state.orderRows.values()) row.status = "cancelado";
      return { data: null, error: null };
    },
  };
  const charge = async () => {
    state.charges++;
    if (options.gatewayThrows) throw new Error("provider-secret-do-not-expose");
    return { id: "fake-payment", invoiceUrl: "https://payment.example.test/fixture", link: "https://payment.example.test/fixture" };
  };
  const deps = {
    ...guards, ...runtime, ...schedule, totalAppointmentMinutes, getStoreConfig,
    supabaseAdmin: supabase, redirect, revalidatePath() {}, headers: async () => new Headers(),
    consumePublicRateLimit: async () => ({ allowed: !options.limited }),
    createAsaasCustomerForPatient: async () => ({ id: "fake-customer" }),
    createAsaasPaymentForBooking: charge, createAsaasCheckoutForOrder: charge,
    createInfinitePayCheckout: async () => { throw new Error("Unexpected provider"); },
    isAsaasConfigured: () => true, resolveClinicPaymentProvider: () => "asaas",
    decryptClinicSecrets: () => ({}), getTrustedAppOrigin: async () => "https://example.test",
    upsertTransactionalConsent: async () => {}, emitDomainEvent: async () => {},
    notifyClinicPublicBooking: async () => { state.notifications++; },
  };
  return {
    state, deps,
    booking: load("src/app/c/[slug]/actions.js", "createPublicBookingAction", deps),
    order: load("src/app/c/[slug]/store-actions.js", "createPublicStoreOrderAction", deps),
  };
}

test("booking real action: honeypot and payload spoofing have zero database side effects", async () => {
  for (const extra of [{ website: "spam" }, { clinica_id: id(90) }, { nome: "x".repeat(2000) }]) {
    const h = harness(); await run(h.booking, form(extra));
    assert.equal(h.state.reads, 0); assert.equal(h.state.charges, 0);
  }
});
test("booking real action: denied limiter prevents RPC and gateway", async () => {
  const h = harness({ limited: true }); await run(h.booking, form());
  assert.equal(h.state.bookings, 0); assert.equal(h.state.charges, 0);
});
test("booking normal, sequential retry: one booking, charge and notification", async () => {
  const h = harness();
  assert.match(await run(h.booking, form()), /^https:\/\/payment/);
  await run(h.booking, form());
  assert.equal(h.state.bookings, 1); assert.equal(h.state.charges, 1); assert.equal(h.state.notifications, 1);
});
test("booking concurrent retry: RPC loser never calls gateway", async () => {
  const h = harness();
  await Promise.all([run(h.booking, form()), run(h.booking, form())]);
  assert.equal(h.state.bookings, 1); assert.equal(h.state.charges, 1); assert.equal(h.state.notifications, 1);
});
test("booking ambiguous gateway failure: retry cannot issue second charge", async () => {
  const h = harness({ gatewayThrows: true });
  const url = await run(h.booking, form()); await run(h.booking, form());
  assert.doesNotMatch(url, /provider-secret/); assert.equal(h.state.charges, 1);
});
test("booking off-grid and procedure from other tenant are rejected", async () => {
  for (const extra of [{ data_hora: "2030-01-10T09:07" }, { procedimento_ids: id(99) }]) {
    const h = harness(); await run(h.booking, form(extra));
    assert.equal(h.state.bookings, 0); assert.equal(h.state.charges, 0);
  }
});
test("store normal and sequential retry: one order and checkout", async () => {
  const h = harness(); await run(h.order, form()); await run(h.order, form());
  assert.equal(h.state.orders, 1); assert.equal(h.state.charges, 1);
});
test("store concurrent retry: unique conflict does not invoke second checkout", async () => {
  const h = harness(); await Promise.all([run(h.order, form()), run(h.order, form())]);
  assert.equal(h.state.orders, 1); assert.equal(h.state.charges, 1);
});
test("store cancelled after ambiguous gateway error retains idempotency", async () => {
  const h = harness({ gatewayThrows: true });
  const url = await run(h.order, form()); await run(h.order, form());
  assert.doesNotMatch(url, /provider-secret/);
  assert.equal(h.state.orders, 1); assert.equal(h.state.charges, 1);
});
test("store invalid quantities and tenant spoofing never create orders", async () => {
  for (const extra of [{ items_json: JSON.stringify([{ produto_id: id(3), quantidade: 1.5 }]) }, { tenant_id: id(99) }]) {
    const h = harness(); await run(h.order, form(extra));
    assert.equal(h.state.orders, 0); assert.equal(h.state.charges, 0);
  }
});
test("bounded reader rejects streaming overflow, nested tenant field is not trusted", async () => {
  const request = new Request("https://example.test", { method: "POST", body: JSON.stringify({ clinica_id: id(1) }) });
  assert.equal((await guards.readBoundedJson(request, 1000)).status, 400);
  const huge = new Request("https://example.test", { method: "POST", body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(200)); controller.close(); } }), duplex: "half" });
  assert.equal((await guards.readBoundedJson(huge, 50)).status, 413);
});
test("production with missing hash secret closes writes, without throwing", async () => {
  const names = ["NODE_ENV", "PUBLIC_RATE_LIMIT_SECRET", "LEAD_HASH_SALT", "SIGNUP_HASH_SALT", "CLINIC_SECRETS_KEY"];
  const saved = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    process.env.NODE_ENV = "production";
    const result = await runtime.consumePublicRateLimitRuntime({ scope: "booking_create", headers: new Headers(), supabase: { rpc() { throw new Error("must not reach DB"); } } });
    assert.equal(result.allowed, false);
  } finally { names.forEach((name, i) => saved[i] === undefined ? delete process.env[name] : process.env[name] = saved[i]); }
});
test("spoofed forwarded headers do not win over Vercel ingress", () => {
  const saved = process.env.VERCEL; process.env.VERCEL = "1";
  try {
    assert.equal(runtime.trustedPublicRequestIp(new Headers({ "x-vercel-forwarded-for": "203.0.113.1", "x-forwarded-for": "198.51.100.9", "x-real-ip": "198.51.100.8" })), "203.0.113.1");
  } finally { saved === undefined ? delete process.env.VERCEL : process.env.VERCEL = saved; }
});
test("IPv6 alternate spellings and privacy addresses share /64", () => {
  const hash = (ip) => runtime.publicRequestFingerprint(new Headers({ "x-forwarded-for": ip }));
  assert.equal(hash("2001:db8:0:0::1"), hash("2001:0db8::2"));
  assert.equal(hash("::ffff:203.0.113.1"), hash("203.0.113.1"));
});
test("analytics redacts arbitrary metadata, email, phone, auth and bearer URLs", () => {
  assert.equal(guards.safeAnalyticsText("fixture@example.test"), null);
  assert.equal(guards.safeAnalyticsText("77999990000"), null);
  assert.equal(guards.safeAnalyticsPath("/auth/callback?code=secret"), null);
  assert.equal(guards.safeAnalyticsPath("/agendamento?email=private"), "/agendamento");
  assert.deepEqual(guards.safeMarketingMetadata({ plan: "growth", email: "private@example.test", nested: {}, token: "secret" }), { plan: "growth" });
});

const json = (body, init = {}) => Response.json(body, { ...init, headers: { "Cache-Control": "no-store", ...init.headers } });
const limiterResponse = (result) => {
  const d = guards.publicRateLimitResponseDescriptor(result);
  return json(d.body, { status: d.status, headers: d.headers });
};
test("analytics handler rejects arbitrary events and oversized JSON before any lookup", async () => {
  const h = harness();
  const handler = load("src/app/api/public/analytics/route.js", "POST", { ...h.deps, noStoreJson: json, publicRateLimitResponse: limiterResponse });
  for (const body of [{ slug: "fixture", eventName: "arbitrary" }, { slug: "fixture", eventName: "page_view", extra: "x".repeat(17000) }, { slug: "fixture", eventName: "page_view", clinica_id: id(99) }]) {
    const response = await handler(new Request("https://example.test", { method: "POST", body: JSON.stringify(body) }));
    assert.ok([400, 413].includes(response.status));
  }
  assert.equal(h.state.reads, 0);
});
test("analytics handler returns actual 429 and Retry-After on limit", async () => {
  const h = harness();
  const handler = load("src/app/api/public/analytics/route.js", "POST", { ...h.deps, noStoreJson: json, publicRateLimitResponse: limiterResponse,
    consumePublicRateLimit: async () => ({ allowed: false, limited: true, retryAfter: 42 }) });
  const response = await handler(new Request("https://example.test", { method: "POST", body: JSON.stringify({ slug: "fixture", eventName: "page_view" }) }));
  assert.equal(response.status, 429); assert.equal(response.headers.get("Retry-After"), "42");
  assert.deepEqual(await response.json(), { ok: false, error: guards.PUBLIC_RATE_LIMIT_MESSAGE });
});
test("recovery action returns same response for known, unknown and provider-failed email", async () => {
  const results = [];
  for (const known of [false, true, "failure"]) {
    const deps = {
      ...guards, normalizeEmail: (x) => x, isDemoLoginEmail: () => false, isInternalAdminEmail: () => false,
      consumePublicRateLimit: async () => ({ allowed: true }), headers: async () => new Headers(),
      getTrustedAppOrigin: async () => "https://example.test",
      createSupabaseClient: () => ({ auth: { resetPasswordForEmail: async () => ({ error: known === "failure" ? new Error("private@example.test") : null }) } }),
    };
    const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55421"; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture";
    try {
      const action = load("src/app/login/actions.js", "requestClientPasswordResetAction", deps);
      results.push(await action(null, form({ email: "fixture@example.test" })));
    } finally {
      oldUrl === undefined ? delete process.env.NEXT_PUBLIC_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
      oldKey === undefined ? delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
    }
  }
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
});
test("form validator rejects duplicate singleton fields and files, accepts procedure arrays", () => {
  const data = form(); data.append("slug", "other"); assert.equal(guards.validPublicForm(data), false);
  const list = form(); list.append("procedimento_ids", id(90)); assert.equal(guards.validPublicForm(list), true);
  const file = form(); file.append("payload", new Blob(["fixture"]), "fixture.txt"); assert.equal(guards.validPublicForm(file), false);
});
test("POST ingress rejects giant action body before Supabase/session refresh", async () => {
  const proxy = load("src/proxy.js", "proxy", {
    noStoreJson: json, publicRateLimitResponse: limiterResponse,
    consumePublicRateLimit: async () => { throw new Error("No quota query for oversized body"); },
  });
  const request = new Request("https://example.test/c/fixture", { method: "POST", headers: { "content-length": "9999999" } });
  request.nextUrl = new URL(request.url);
  assert.equal((await proxy(request)).status, 413);
});

