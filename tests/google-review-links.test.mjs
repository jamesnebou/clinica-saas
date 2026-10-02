import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeSimpleGoogleLinks, normalizeGoogleReviewUrl, simpleGoogleLinks } from "../src/lib/google/simple-review-links.mjs";
import { googlePlacesAutomationEnabled } from "../src/lib/google/automation-mode.mjs";
import { selectPublicTestimonials } from "../src/lib/public-testimonials.mjs";

const publicPage = new URL("../src/app/c/[slug]/page.js", import.meta.url);
const simpleSection = new URL("../src/app/c/[slug]/simple-testimonials-section.js", import.meta.url);
const adminPage = new URL("../src/app/dashboard/configuracoes/page.js", import.meta.url);
const actions = new URL("../src/app/dashboard/actions.js", import.meta.url);
const publicApi = new URL("../src/app/api/public/google-reviews/route.js", import.meta.url);
const adminApi = new URL("../src/app/api/dashboard/google-places/route.js", import.meta.url);
const writeUrl = "https://g.page/r/example/review";
const viewUrl = "https://www.google.com/maps/place/Example";

test("1. dois links válidos habilitam os dois botões públicos", async () => {
  assert.deepEqual(simpleGoogleLinks({ google_review_write_url: writeUrl, google_reviews_view_url: viewUrl }), { writeUrl, viewUrl });
  const section = await readFile(simpleSection, "utf8");
  assert.match(section, /\{writeUrl \? <a href=\{writeUrl\} target="_blank" rel="noopener noreferrer"[\s\S]*?Me avalie no Google!/);
  assert.match(section, /\{viewUrl \? <a href=\{viewUrl\} target="_blank" rel="noopener noreferrer"[\s\S]*?Ver avaliações do Google/);
});

test("2. somente link para avaliar habilita o botão principal", () => {
  assert.deepEqual(simpleGoogleLinks({ google_review_write_url: writeUrl }), { writeUrl, viewUrl: null });
});

test("3. somente link de consulta habilita o botão secundário", () => {
  assert.deepEqual(simpleGoogleLinks({ google_reviews_view_url: viewUrl }), { writeUrl: null, viewUrl });
});

test("4. nenhum link mantém depoimentos manuais", () => {
  const manual = [{ nome: "Cliente", texto: "Atendimento real" }];
  assert.deepEqual(selectPublicTestimonials({ depoimentos: manual }, { reviews: [] }), manual);
  assert.deepEqual(simpleGoogleLinks({}), { writeUrl: null, viewUrl: null });
});

test("5. nenhum link e nenhum depoimento ocultam a seção", async () => {
  const section = await readFile(simpleSection, "utf8");
  assert.match(section, /if \(!testimonials\.length && !writeUrl && !viewUrl\) return null/);
  assert.equal(selectPublicTestimonials({}, { reviews: [] }).length, 0);
});

test("6. protocolos perigosos, credenciais e domínios estranhos são rejeitados", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,hi", "http://google.com/maps", "https://google.com.evil.test/maps", "https://google.com@evil.test/maps", "https://user:pass@google.com/maps", "https://google.com:444/maps", "https://google.com/url?q=https://evil.test", "abc"]) {
    assert.throws(() => normalizeGoogleReviewUrl(value));
  }
  assert.equal(normalizeGoogleReviewUrl("https://maps.app.goo.gl/example"), "https://maps.app.goo.gl/example");
  assert.equal(normalizeGoogleReviewUrl("https://goo.gl/maps/example"), "https://goo.gl/maps/example");
  assert.equal(normalizeGoogleReviewUrl(""), null);
});

test("7. gravação usa clínica autenticada e rejeita tenant do formulário", async () => {
  const source = await readFile(actions, "utf8");
  const action = source.slice(source.indexOf("export async function updateClinicSettingsAction"), source.indexOf("export async function", source.indexOf("export async function updateClinicSettingsAction") + 1));
  assert.match(action, /const \{ clinicaId, activeClinic, memberships \} = await getScopedSupabase\(\)/);
  assert.match(action, /requireClinicManager\(memberships, clinicaId/);
  assert.match(action, /\.eq\("id", clinicaId\)/);
  assert.doesNotMatch(action, /formData\.get\("clinica_id"\)/);
});

test("8. configurar e limpar links não apaga depoimentos manuais", () => {
  const manual = [{ nome: "Cliente", texto: "Relato real" }];
  const original = { depoimentos: manual, google_place_id: "ChIJoldplace", google_reviews_ativo: true };
  const configured = mergeSimpleGoogleLinks(original, { writeUrl, viewUrl });
  const cleared = mergeSimpleGoogleLinks(configured, { writeUrl: "", viewUrl: "" });
  assert.deepEqual(configured.depoimentos, manual);
  assert.deepEqual(cleared.depoimentos, manual);
  assert.equal(cleared.google_review_write_url, null);
  assert.equal(cleared.google_reviews_view_url, null);
});

test("9. Place ID antigo é preservado, mas não ativa Places no fluxo atual", async () => {
  const merged = mergeSimpleGoogleLinks({ google_place_id: "ChIJoldplace" }, { writeUrl: "", viewUrl: "" });
  assert.equal(merged.google_place_id, "ChIJoldplace");
  assert.equal(googlePlacesAutomationEnabled(), false);
  const page = await readFile(publicPage, "utf8");
  const admin = await readFile(adminPage, "utf8");
  assert.doesNotMatch(page, /googleConnected|google_place_id|getGooglePlaceReviews/);
  assert.doesNotMatch(admin, /getGooglePlaceDetails|GoogleReviewsConnector|Google conectado/);
  assert.match(await readFile(publicApi, "utf8"), /if \(!googlePlacesAutomationEnabled\(\)\) return/);
  assert.match(await readFile(adminApi, "utf8"), /if \(!googlePlacesAutomationEnabled\(\)\) return/);
});

test("10. página pública não solicita endpoint de reviews na v1", async () => {
  const page = await readFile(publicPage, "utf8");
  const section = await readFile(simpleSection, "utf8");
  assert.doesNotMatch(`${page}\n${section}`, /\/api\/public\/google-reviews|fetch\(/);
  assert.match(page, /const showTestimonials = testimonials\.length > 0 \|\| Boolean\(writeUrl \|\| viewUrl\)/);
});

test("botão Carrinho tem a mesma altura e alinhamento do botão de menu mobile", async () => {
  const cart = await readFile(new URL("../src/app/c/[slug]/store-cart.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(cart, /top-\[max\(0\.4rem,calc\(env\(safe-area-inset-top\)\+0\.2rem\)\)\]/);
  assert.match(cart, /h-\[3\.75rem\]/);
  assert.match(css, /\.public-floating-menu-button[\s\S]*?height: 3\.75rem/);
});
