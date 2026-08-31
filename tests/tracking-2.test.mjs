import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFbc,
  deterministicMetaEventId,
  isMetaStandardEvent,
  isValidMetaEventId,
  marketingPhoneCandidates,
  metaRetryDelayMinutes,
  normalizeEmail,
  normalizeMarketingAttribution,
  normalizePersonName,
  normalizePhone,
  sanitizeInternalMetadata,
  sanitizeMetaCustomData,
  splitPersonName,
} from "../src/lib/tracking/core.mjs";

test("Tracking 2 reconhece somente eventos Meta autorizados", () => {
  for (const name of ["ViewContent", "Lead", "Schedule", "CompleteRegistration", "Subscribe", "Purchase"]) {
    assert.equal(isMetaStandardEvent(name), true, name);
  }
  assert.equal(isMetaStandardEvent("PageView"), false);
  assert.equal(isMetaStandardEvent("CustomSql"), false);
});

test("normalização de e-mail, telefone BR e nomes é determinística", () => {
  assert.equal(normalizeEmail("  James@Example.COM "), "james@example.com");
  assert.equal(normalizePhone("(77) 98888-7777"), "5577988887777");
  assert.equal(normalizePhone("+55 77 98888-7777"), "5577988887777");
  assert.equal(normalizePersonName("João D'Ávila"), "joãodávila");
  assert.deepEqual(splitPersonName("João da Silva"), { firstName: "João", lastName: "da Silva" });
});

test("matching de telefone recupera atribuição com ou sem código do país", () => {
  assert.deepEqual(marketingPhoneCandidates("(77) 98888-7777"), ["77988887777", "5577988887777"]);
  assert.deepEqual(marketingPhoneCandidates("+55 77 98888-7777"), ["5577988887777", "77988887777"]);
});

test("fbc usa fbclid sem inventar valor quando não existe clique Meta", () => {
  assert.equal(buildFbc({}), null);
  const fbc = buildFbc({ fbclid: "ABC123", capturedAt: "2026-08-29T12:00:00.000Z" });
  assert.match(fbc, /^fb\.1\.\d{13}\.ABC123$/);
  assert.equal(buildFbc({ fbc: "fb.1.1.EXISTING", fbclid: "OTHER" }), "fb.1.1.EXISTING");
});

test("last-touch pago prevalece sem apagar first-touch", () => {
  const attribution = normalizeMarketingAttribution({
    first_touch: { utm_source: "facebook", utm_campaign: "primeira", landing_page: "/odontologia" },
    last_touch: { utm_source: "instagram", utm_campaign: "remarketing", landing_page: "/odontologia" },
    utm_source: "facebook",
    utm_campaign: "primeira",
  });
  assert.equal(attribution.first_touch.utm_campaign, "primeira");
  assert.equal(attribution.last_touch.utm_campaign, "remarketing");
  assert.equal(attribution.utm_source, "instagram");
  assert.equal(attribution.utm_campaign, "remarketing");
});

test("event_id determinístico é válido para deduplicação", () => {
  const id = deterministicMetaEventId("purchase", "pay_123");
  assert.equal(id, "purchase:pay_123");
  assert.equal(isValidMetaEventId(id), true);
  assert.equal(isValidMetaEventId("inválido com espaço"), false);
});

test("custom_data Meta aceita somente dimensões comerciais previstas", () => {
  assert.deepEqual(sanitizeMetaCustomData({
    segment: "odontologia",
    plan: "growth",
    value: 299.999,
    currency: "brl",
    diagnostico: "não pode",
    prontuario: "não pode",
  }), {
    segment: "odontologia",
    plan: "growth",
    value: 300,
    currency: "BRL",
  });
});

test("metadata interno bloqueia chaves clínicas sensíveis", () => {
  const safe = sanitizeInternalMetadata({
    location: "hero",
    diagnostico: "segredo",
    prontuario: "segredo",
    cpf: "000",
    score: 10,
  });
  assert.deepEqual(safe, { location: "hero", score: 10 });
});

test("backoff da CAPI cresce e limita em 60 minutos", () => {
  assert.equal(metaRetryDelayMinutes(1), 1);
  assert.equal(metaRetryDelayMinutes(2), 2);
  assert.equal(metaRetryDelayMinutes(3), 4);
  assert.equal(metaRetryDelayMinutes(10), 60);
});
