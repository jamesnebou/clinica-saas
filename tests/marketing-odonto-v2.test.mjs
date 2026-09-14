import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";
import { getSegmentLanding, marketingSegments, esteticaLanding } from "../src/lib/marketing/segments.js";
import { marketingSignupHref, marketingWhatsAppHref, pricingEventData } from "../src/lib/marketing/commercial-links.mjs";
import { buildMarketingLeadPayload } from "../src/lib/tracking/marketing-lead.mjs";
const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("somente Odontologia resolve premium-v2, oito segmentos preservados", () => {
  assert.equal(marketingSegments.length, 8);
  for (const { slug } of marketingSegments) {
    const landing = getSegmentLanding(slug);
    assert.equal(landing.slug, slug);
    assert.equal(landing.variant === "premium-v2", slug === "odontologia");
    assert.ok(landing.faqs.length >= 12);
  }
  assert.equal(getSegmentLanding("nao-existe"), null);
  assert.equal(getSegmentLanding("__proto__"), null);
});

test("roteamento explicito e fallback restrito sem modificar a pagina Estetica", async () => {
  const [page, shared, other, old] = await Promise.all([
    source("src/app/odontologia/page.js"), source("src/components/marketing/segment-landing-page.js"),
    source("src/app/fisioterapia/page.js"), source("src/app/estetica/page.js"),
  ]);
  assert.match(page, /getSegmentLanding\("odontologia"\)/);
  assert.match(shared, /config.variant === "premium-v2"/);
  assert.match(other, /getSegmentLanding\("fisioterapia"\)/);
  for (const { slug } of marketingSegments) await access(new URL("../src/app/" + slug + "/page.js", import.meta.url));
  assert.match(old, /config=\{esteticaLanding\}/);
});

test("Odontologia preserva canonical e planos dinamicos sem precos locais", async () => {
  const page = await source("src/app/odontologia/page.js");
  assert.match(page, /canonical: "\/odontologia"/);
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /toMarketingPlans\(await getSystemPlans\(\)\)/);
  assert.equal(getSegmentLanding("odontologia").metadata.title, "Sistema para Clínica Odontológica | NexaWi Clínicas");
  assert.equal(getSegmentLanding("odontologia").hero.image, "/marketing/odontologia/hero-dental.png");
  assert.equal(getSegmentLanding("odontologia").hero.title, "Da primeira consulta ao fechamento do tratamento, tudo sob controle.");
  for (const path of ["src/lib/marketing/odontologia.js", "src/components/marketing/premium/premium-segment-landing-page.js", "src/app/fisioterapia/page.js"]) {
    assert.doesNotMatch(await source(path), /preco_mensal:\s*\d|R\$\s*\d/);
  }
});

test("alteracao de plano invalida todas as landings publicas", async () => {
  const actions = await source("src/app/admin/actions.js");
  for (const path of ["/", "/estetica", "/odontologia", "/fisioterapia", "/medicina", "/psicologia", "/nutricao", "/pilates", "/multidisciplinar"]) {
    assert.match(actions, new RegExp(`['\"]${path.replace("/", "\\/")}['\"]`));
  }
  assert.match(actions, /for \(const path of MARKETING_PLAN_PATHS\) revalidatePath\(path\)/);
});

test("CTA preserva plan e segment e destino antigo sem segmento", () => {
  assert.equal(marketingSignupHref("growth", "odontologia"), "/cadastro?plan=growth&segment=odontologia");
  assert.equal(marketingSignupHref("premium"), "/cadastro?plan=premium");
  const url = new URL(marketingSignupHref("growth", "odontologia&plan=premium"), "https://example.invalid");
  assert.equal(url.searchParams.get("plan"), "growth");
  assert.equal(url.searchParams.get("segment"), "odontologia&plan=premium");
});

test("pricing_click inclui segmento e componente usa helper testado", async () => {
  assert.deepEqual(pricingEventData("growth", "odontologia"), { plan: "growth", segment: "odontologia" });
  const component = await source("src/components/marketing/plan-cta.js");
  assert.match(component, /eventNames = \["pricing_click"\]/);
  assert.match(component, /window\.dispatchEvent\(new CustomEvent\("nexawi:plan-selected", \{ detail: plan \}\)\)/);
  assert.match(component, /href=\{marketingSignupHref\(plan, segment\)\}/);
  const landing = await source("src/components/marketing/premium/premium-segment-landing-page.js");
  assert.match(landing, /PlanCta plan=\{plan.slug\} segment=\{config.slug\}/);
  assert.match(landing, /PlanContactCta plan=\{plan.slug\} segment=\{config.slug\}/);
  assert.match(landing, /eventName="hero_primary_cta_click"/);
});

test("WhatsApp odontologico usa mesmo numero e registra location/segment", async () => {
  const odonto = new URL(marketingWhatsAppHref("odontologia"));
  const generic = new URL(marketingWhatsAppHref("geral"));
  assert.equal(odonto.origin, "https://wa.me");
  assert.equal(odonto.pathname, generic.pathname);
  assert.match(odonto.searchParams.get("text"), /clínica odontológica/);
  const form = await source("src/components/marketing/lead-capture-form.js");
  assert.match(form, /marketingWhatsAppHref\(segment\)/);
  assert.match(form, /whatsapp_click", \{ location: "lead_form", segment \}/);
});

test("lead mantem consentimentos separados, segmento, evento e guard", async () => {
  const consent = { analytics: true, marketing: true, decided: true };
  const payload = buildMarketingLeadPayload({ formPayload: { name: "Teste", contact_consent: "on", website: "", form_started_at: "1" }, attribution: { consent }, plan: "growth", sessionId: "test-session", metaEventId: "lead:test", segment: "odontologia" });
  assert.equal(payload.contact_consent, "on");
  assert.deepEqual(payload.consent, consent);
  assert.equal(payload.segment, "odontologia");
  const form = await source("src/components/marketing/lead-capture-form.js");
  assert.match(form, /<PublicFormGuard \/>/);
  assert.match(form, /name="contact_consent" type="checkbox" required/);
  assert.match(form, /trackMetaStandardEvent\("Lead"/);
  assert.match(form, /placeholder=\{clinicPlaceholder\}/);
  assert.match(form, /selectedPlan = "nao_sei"/);
  assert.match(form, /<option value="" disabled>Selecione<\/option>/);
  assert.match(form, /trackMarketingEvent\("lead_form_start", \{ segment, plan \}\)/);
});

test("landing premium usa marca institucional textual, comparação e FAQ de planos", async () => {
  const [landing, comparison, odonto] = await Promise.all([
    source("src/components/marketing/premium/premium-segment-landing-page.js"),
    source("src/components/marketing/premium/premium-plan-comparison.js"),
    source("src/lib/marketing/odontologia.js"),
  ]);
  assert.match(landing, /NexaWi <small>Clínicas<\/small>/);
  assert.doesNotMatch(landing, /nexawi-clinicas\.png/);
  assert.match(landing, /PremiumPlanComparison plans=\{plans\} segment=\{config.slug\}/);
  assert.match(comparison, /buildPlanComparison/);
  assert.match(comparison, /plan_recommendation_click/);
  assert.match(odonto, /Posso mudar de plano depois\?/);
  assert.match(odonto, /O que acontece quando minha clínica atinge o limite do plano\?/);
  assert.match(odonto, /Quais recursos mudam entre Starter, Growth e Premium\?/);
});

test("sitemap inclui registry inteiro e Estetica mantem assets dedicados", async () => {
  assert.match(await source("src/app/sitemap.js"), /marketingSegments.map/);
  assert.equal(esteticaLanding.hero.image, "/marketing/estetica/hero.jpg");
  assert.equal(esteticaLanding.transformation.image, "/marketing/estetica/consultation.jpg");
  assert.match(await source("src/components/marketing/segment-landing-page.js"), /config.transformation\?\.image/);
  await access(new URL("../public" + esteticaLanding.hero.image, import.meta.url));
  await access(new URL("../public" + getSegmentLanding("odontologia").hero.image, import.meta.url));
});

test("V2 preserva oito modulos, cinco etapas e papeis sem acesso clinico para recepcao", () => {
  const config = getSegmentLanding("odontologia");
  assert.equal(config.modules.length, 8);
  assert.deepEqual(config.workflow.map(({ label }) => label), ["Captar", "Agendar", "Atender", "Receber", "Retomar"]);
  assert.equal(config.roles[0].title, "Recepção");
  assert.doesNotMatch(config.roles[0].items.join(" "), /clínic|prontuário/i);
});

test("interacoes acessiveis, CSS isolado e reduced motion", async () => {
  const client = await source("src/components/marketing/premium/premium-interactions.js");
  assert.match(client, /aria-expanded/);
  assert.match(client, /role="tablist"/);
  assert.match(client, /ArrowRight/);
  assert.match(client, /event.key === "Escape"/);
  assert.match(client, /\/marketing\/odontologia\/roles-devices\.png/);
  await access(new URL("../public/marketing/odontologia/roles-devices.png", import.meta.url));
  const css = await source("src/components/marketing/premium/premium.module.css");
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /font-size:\s*[^;]*vw/);
});

test("prova de produto nao inventa ratings ou certificacoes", async () => {
  const component = await source("src/components/marketing/premium/premium-segment-landing-page.js");
  assert.match(component, /\/clinic-dashboard-preview.png/);
  assert.doesNotMatch(component, /aggregateRating|Mais escolhido|certifica[çc][aã]o LGPD|100%/i);
  assert.match(component, /segment: config.slug/);
});

test("telemetria da landing usa apenas contexto comercial, sem PII", async () => {
  const [gallery, interactions, comparison] = await Promise.all([
    source("src/components/marketing/premium/premium-product-gallery.js"),
    source("src/components/marketing/premium/premium-interactions.js"),
    source("src/components/marketing/premium/premium-plan-comparison.js"),
  ]);
  assert.match(gallery, /trackMarketingEvent\("product_gallery_tab", \{ segment, category: nextTab.category, tab: nextTab.id \}\)/);
  assert.match(interactions, /trackMarketingEvent\("faq_open", \{ segment, question:/);
  assert.match(comparison, /eventName="plan_comparison_view"/);
  assert.doesNotMatch(gallery + interactions + comparison, /\b(email|phone|telefone|formPayload|firstName|lastName)\b/i);
});
