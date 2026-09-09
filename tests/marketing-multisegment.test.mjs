import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("portal comercial declara os oito segmentos previstos", async () => {
  const contents = await source("src/lib/marketing/segments.js");
  for (const segment of ["estetica", "odontologia", "fisioterapia", "medicina", "psicologia", "nutricao", "pilates", "multidisciplinar"]) {
    assert.match(contents, new RegExp(`slug: "${segment}"`));
  }
});

test("landing de estetica usa arquitetura reutilizavel e planos dinamicos", async () => {
  const page = await source("src/app/estetica/page.js");
  assert.match(page, /SegmentLandingPage/);
  assert.match(page, /getSystemPlans/);
  assert.match(page, /toMarketingPlans/);
  assert.doesNotMatch(page, /preco_mensal:\s*\d/);
});

test("landing de estetica possui FAQ comercial completo", async () => {
  const contents = await source("src/lib/marketing/segments.js");
  const faqBlock = contents.split("faqs: [")[1].split("],\n  },")[0];
  assert.ok((faqBlock.match(/^\s+\["/gm) || []).length >= 12);
});

test("formulario envia segmento explicito preservando tracking", async () => {
  const form = await source("src/components/marketing/lead-capture-form.js");
  const payload = await source("src/lib/tracking/marketing-lead.mjs");
  assert.match(form, /buildMarketingLeadPayload/);
  assert.match(form, /metaEventId,/);
  assert.match(form, /segment,/);
  assert.match(payload, /contact_consent: formPayload\.contact_consent/);
  assert.match(payload, /consent: attribution\.consent/);
  assert.match(form, /trackMetaStandardEvent\("Lead"/);
});

test("paginas publicas ativam tracking com contexto separado", async () => {
  const portal = await source("src/components/marketing/marketing-portal.js");
  const landing = await source("src/components/marketing/segment-landing-page.js");
  assert.match(portal, /pageType="marketing_portal"/);
  assert.match(landing, /pageType="segment_landing"/);
  assert.match(landing, /segment=\{config\.slug\}/);
});
