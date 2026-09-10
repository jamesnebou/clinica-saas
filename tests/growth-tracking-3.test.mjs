import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { allowsAnalytics, allowsMarketing, hasPaidMarketingAttribution, normalizeMarketingAttribution, resolveOnboardingMarketingAttribution, sanitizeInternalMetadata } from "../src/lib/tracking/core.mjs";
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
  assert.equal(result.gclid, undefined);
  assert.equal(result.attribution_version, 3);
  assert.equal(allowsAnalytics(result), true);
  assert.equal(allowsMarketing(result), true);
});

test("novo last paid touch não herda click ID de campanha anterior", () => {
  const attribution = normalizeMarketingAttribution({
    first_touch: { utm_source: "google", utm_campaign: "first", gclid: "old-google-click" },
    last_touch: { utm_source: "instagram", utm_campaign: "second", fbclid: "new-meta-click" },
    gclid: "old-google-click",
    consent: { analytics: true, marketing: true, decided: true },
  });

  assert.equal(attribution.gclid, undefined);
  assert.equal(attribution.fbclid, "new-meta-click");

  const conversion = buildGoogleOfflineConversion({
    eventName: "CompleteRegistration",
    eventId: "registration:clinic_123",
    eventTime: "2026-09-08T12:00:00.000Z",
    attribution,
  });
  assert.equal(conversion.gclid, null);
});

test("onboarding cross-browser preserva atribuição paga e consentimento do signup", () => {
  const metadata = normalizeMarketingAttribution({
    first_touch: { utm_source: "meta", utm_campaign: "campanha_a", fbclid: "fb_123" },
    last_touch: { utm_source: "meta", utm_campaign: "campanha_a", fbclid: "fb_123" },
    consent: { analytics: true, marketing: true, decided: true },
  });
  const form = normalizeMarketingAttribution({
    consent: { analytics: false, marketing: false, decided: false },
  });

  assert.equal(hasPaidMarketingAttribution(form), false);
  const result = resolveOnboardingMarketingAttribution({ formAttribution: form, userMetadataAttribution: metadata });
  assert.equal(result.utm_source, "meta");
  assert.equal(result.utm_campaign, "campanha_a");
  assert.equal(result.fbclid, "fb_123");
  assert.equal(result.consent.marketing, true);
  assert.equal(result.consent.decided, true);
});

test("contexto direto do onboarding não substitui campanha persistida", () => {
  const result = resolveOnboardingMarketingAttribution({
    userMetadataAttribution: {
      utm_source: "meta",
      utm_campaign: "campanha_a",
      fbclid: "fb_123",
      consent: { marketing: true, decided: true },
    },
    formAttribution: {
      landing_page: "/onboarding",
      page_type: "onboarding",
      consent: { marketing: false, decided: false },
    },
  });

  assert.equal(result.utm_campaign, "campanha_a");
  assert.equal(result.fbclid, "fb_123");
  assert.equal(result.consent.marketing, true);
});

test("novo paid touch atualiza last touch sem contaminar Meta com gclid antigo", () => {
  const result = resolveOnboardingMarketingAttribution({
    userMetadataAttribution: {
      first_touch: { utm_source: "google", utm_campaign: "campanha_a", gclid: "google_antigo" },
      last_touch: { utm_source: "google", utm_campaign: "campanha_a", gclid: "google_antigo" },
      consent: { marketing: true, decided: true },
    },
    formAttribution: {
      first_touch: { utm_source: "meta", utm_campaign: "campanha_b", fbclid: "meta_novo" },
      last_touch: { utm_source: "meta", utm_campaign: "campanha_b", fbclid: "meta_novo" },
      consent: { marketing: true, decided: true },
    },
  });

  assert.equal(result.first_touch.utm_source, "google");
  assert.equal(result.first_touch.gclid, "google_antigo");
  assert.equal(result.last_touch.utm_source, "meta");
  assert.equal(result.last_touch.fbclid, "meta_novo");
  assert.equal(result.gclid, undefined);
  assert.equal(result.fbclid, "meta_novo");
});

test("decisão explícita atual pode revogar marketing sem apagar campanha", () => {
  const result = resolveOnboardingMarketingAttribution({
    userMetadataAttribution: {
      utm_source: "meta",
      utm_campaign: "campanha_a",
      fbclid: "fb_123",
      consent: { analytics: true, marketing: true, decided: true },
    },
    formAttribution: {
      consent: { analytics: false, marketing: false, decided: true },
    },
  });

  assert.equal(result.utm_campaign, "campanha_a");
  assert.equal(result.consent.marketing, false);
  assert.equal(result.consent.decided, true);
  assert.equal(allowsMarketing(result), false);
});

test("fallback do lead não sofre downgrade por contexto normalizado vazio", () => {
  const leadAttribution = normalizeMarketingAttribution({
    utm_source: "google",
    utm_campaign: "lead_pago",
    gclid: "click_123",
    consent: { analytics: true, marketing: true, decided: true },
  });
  const result = resolveOnboardingMarketingAttribution({
    formAttribution: normalizeMarketingAttribution({}),
    userMetadataAttribution: leadAttribution,
  });

  assert.equal(result.utm_source, "google");
  assert.equal(result.gclid, "click_123");
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

test("onboarding usa parse cru e resolver semântico antes de persistir", () => {
  const onboarding = source("src/app/onboarding/actions.js");
  const service = source("src/lib/tracking/service.js");
  assert.match(onboarding, /parseRawMarketingAttribution/);
  assert.match(onboarding, /resolveOnboardingMarketingAttribution/);
  assert.doesNotMatch(onboarding, /Object\.keys\(value\)\.length/);
  assert.match(service, /const effective = resolveOnboardingMarketingAttribution/);
  assert.match(service, /enqueueGoogleOfflineConversion/);
});

test("CompleteRegistration usa a clínica como identidade determinística", () => {
  const onboarding = source("src/app/onboarding/actions.js");
  const migrationMeta = source("supabase/migrations/20260831120000_tracking_2_meta_capi.sql");
  const migrationGoogle = source("supabase/migrations/20260907120000_growth_tracking_3_phase_1.sql");
  assert.match(onboarding, /deterministicMetaEventId\("complete_registration", clinica\.id\)/);
  assert.doesNotMatch(onboarding, /formData\.get\("meta_registration_event_id"\)/);
  assert.match(migrationMeta, /unique\(event_name, event_id\)/);
  assert.match(migrationGoogle, /unique\(event_name, event_id\)/);
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
