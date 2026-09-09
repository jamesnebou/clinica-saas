import test from "node:test";
import assert from "node:assert/strict";

import { allowsMarketing, normalizeMarketingAttribution } from "../src/lib/tracking/core.mjs";
import { buildMarketingLeadPayload, hasContactConsent } from "../src/lib/tracking/marketing-lead.mjs";

function buildPayload({ contactConsent, marketing }) {
  const attribution = normalizeMarketingAttribution({
    first_touch: { utm_source: "google", gclid: "test-click" },
    last_touch: { utm_source: "meta", fbclid: "test-meta-click" },
    consent: { analytics: true, marketing, decided: true },
  });

  return buildMarketingLeadPayload({
    formPayload: { name: "Lead de teste", contact_consent: contactConsent },
    attribution,
    plan: "growth",
    sessionId: "session-test",
    metaEventId: "lead:event-test",
    segment: "geral",
  });
}

test("consentimento comercial e tracking coexistem sem sobrescrita", () => {
  const payload = buildPayload({ contactConsent: "on", marketing: true });

  assert.equal(payload.contact_consent, "on");
  assert.deepEqual(payload.consent, {
    necessary: true,
    analytics: true,
    marketing: true,
    decided: true,
    updated_at: null,
  });
  assert.equal(hasContactConsent(payload), true);
  assert.equal(allowsMarketing(normalizeMarketingAttribution(payload)), true);
});

test("contact_consent ausente rejeita o lead", () => {
  const payload = buildPayload({ contactConsent: undefined, marketing: true });
  assert.equal(hasContactConsent(payload), false);
});

test("contact_consent false rejeita o lead", () => {
  const payload = buildPayload({ contactConsent: false, marketing: true });
  assert.equal(hasContactConsent(payload), false);
});

test("consentimento comercial aceita lead sem habilitar marketing opcional", () => {
  const payload = buildPayload({ contactConsent: true, marketing: false });
  const attribution = normalizeMarketingAttribution(payload);

  assert.equal(hasContactConsent(payload), true);
  assert.equal(allowsMarketing(attribution), false);
});

test("consentimento comercial com marketing torna destinos opcionais elegiveis", () => {
  const payload = buildPayload({ contactConsent: true, marketing: true });
  const attribution = normalizeMarketingAttribution(payload);

  assert.equal(hasContactConsent(payload), true);
  assert.equal(allowsMarketing(attribution), true);
});
