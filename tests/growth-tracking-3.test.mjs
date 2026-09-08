import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { allowsAnalytics, allowsMarketing, normalizeMarketingAttribution, sanitizeInternalMetadata } from "../src/lib/tracking/core.mjs";
import { buildGoogleEnhancedUserData, buildGoogleOfflineConversion } from "../src/lib/tracking/google-core.mjs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Growth 3 preserva first/last touch e click IDs Google", () => {
  const result = normalizeMarketingAttribution({
    first_touch: { utm_source: "google", gclid: "first-click" },
    last_touch: { utm_source: "youtube", gbraid: "last-braid" },
    consent: { analytics: true, marketing: true, decided: true },
  });
  assert.equal(result.first_touch.gclid, "first-click");
  assert.equal(result.last_touch.gbraid, "last-braid");
  assert.equal(result.gbraid, "last-braid");
  assert.equal(result.attribution_version, 3);
  assert.equal(allowsAnalytics(result), true);
  assert.equal(allowsMarketing(result), true);
});

test("consentimento negado bloqueia destinos opcionais", () => {
  const result = normalizeMarketingAttribution({ consent: { analytics: false, marketing: false, decided: true } });
  assert.equal(allowsAnalytics(result), false);
  assert.equal(allowsMarketing(result), false);
});

test("enhanced conversions guarda somente hashes deterministas", () => {
  const userData = buildGoogleEnhancedUserData({ email: " Pessoa@Example.com ", phone: "(77) 99999-8888", firstName: "Maria" });
  assert.match(userData.email_sha256, /^[a-f0-9]{64}$/);
  assert.match(userData.phone_sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(userData).includes("example.com"), false);
  assert.equal(JSON.stringify(userData).includes("99999"), false);
});

test("contrato offline usa identidade e valor estaveis", () => {
  const conversion = buildGoogleOfflineConversion({ eventName: "Purchase", eventId: "purchase:pay_123", eventTime: "2026-09-07T12:00:00.000Z", attribution: { gclid: "click-1" }, value: 299.999, currency: "brl" });
  assert.equal(conversion.event_id, "purchase:pay_123");
  assert.equal(conversion.gclid, "click-1");
  assert.equal(conversion.value, 300);
  assert.equal(conversion.currency, "BRL");
});

test("metadata interna bloqueia PII e dados clinicos", () => {
  const result = sanitizeInternalMetadata({ email: "pessoa@example.com", telefone: "77999998888", cpf: "000", diagnostico: "x", location: "hero" });
  assert.deepEqual(result, { location: "hero" });
});

test("rotas externas e lifecycle respeitam consentimento", () => {
  const events = source("src/app/api/public/marketing-events/route.js");
  const leads = source("src/app/api/public/marketing-leads/route.js");
  const service = source("src/lib/tracking/service.js");
  assert.match(events, /allowsMarketing\(attribution\)/);
  assert.match(leads, /if \(allowsMarketing\(attribution\)\)/);
  assert.match(service, /marketing_consent_required/);
});

test("migration Growth 3 e RLS sao incrementais", () => {
  const migration = source("supabase/migrations/20260907120000_growth_tracking_3_phase_1.sql");
  assert.match(migration, /add column if not exists gclid/);
  assert.match(migration, /create table if not exists public\.google_offline_conversion_events/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* from public, anon, authenticated/);
  assert.match(migration, /unique\(event_name, event_id\)/);
});

test("Purchase continua exclusivo do webhook SaaS endurecido", () => {
  const webhook = source("src/app/api/webhooks/asaas/route.js");
  assert.match(webhook, /buildSaasPurchaseDecision/);
  assert.match(webhook, /eventName: "Purchase"/);
  assert.ok(webhook.indexOf("storeOrderUpdated) return") < webhook.indexOf("eventName: \"Purchase\""));
});
