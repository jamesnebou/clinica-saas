import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectPublicTestimonials, testimonialRating } from "../src/lib/public-testimonials.mjs";
import { getGooglePlaceReviews } from "../src/lib/google/places.js";

const pagePath = new URL("../src/app/c/[slug]/page.js", import.meta.url);
const menuPath = new URL("../src/app/c/[slug]/mobile-menu.js", import.meta.url);
const settingsPath = new URL("../src/app/dashboard/configuracoes/page.js", import.meta.url);
const actionsPath = new URL("../src/app/dashboard/actions.js", import.meta.url);

test("clínica com três depoimentos cadastrados exibe apenas os três textos originais", () => {
  const saved = [
    { nome: "Cliente 1", procedimento: "Procedimento 1", texto: "Relato 1" },
    { nome: "Cliente 2", procedimento: "Procedimento 2", texto: "Relato 2" },
    { nome: "Cliente 3", procedimento: "Procedimento 3", texto: "Relato 3" },
  ];
  const selected = selectPublicTestimonials({ depoimentos: saved }, { reviews: [] });
  assert.deepEqual(selected, saved);
  assert.equal(selected.length, 3);
});

test("clínica sem depoimentos não recebe nomes, textos ou estrelas inventados", async () => {
  assert.deepEqual(selectPublicTestimonials({ depoimentos: [] }, { reviews: [] }), []);
  assert.deepEqual(selectPublicTestimonials({}, { reviews: [] }), []);
  assert.equal(testimonialRating(undefined), null);
  assert.equal(testimonialRating(null), null);

  const page = await readFile(pagePath, "utf8");
  const menu = await readFile(menuPath, "utf8");
  assert.match(page, /\{testimonials\.length \|\| googleConnected \? <TestimonialsSection/);
  assert.match(page, /depoimentosAtivos=\{testimonials\.length > 0 \|\| googleConnected\}/);
  assert.match(menu, /\{depoimentosAtivos \? <a href="#depoimentos"/);
  assert.doesNotMatch(page, /fallbackTestimonials|"Paciente"|item\.texto \|\||item\.rating \|\| 5/);
});

test("site de cada clínica seleciona apenas seus próprios depoimentos", async () => {
  const clinicA = { metadata: { site_publico: { depoimentos: [{ nome: "Cliente A", texto: "Relato A" }] } } };
  const clinicB = { metadata: { site_publico: { depoimentos: [] } } };
  assert.deepEqual(selectPublicTestimonials(clinicA.metadata.site_publico, { reviews: [] }), clinicA.metadata.site_publico.depoimentos);
  assert.deepEqual(selectPublicTestimonials(clinicB.metadata.site_publico, { reviews: [] }), []);

  const page = await readFile(pagePath, "utf8");
  assert.match(page, /\.from\("clinicas"\)[\s\S]*?\.eq\("slug", slug\)/);
  assert.match(page, /const site = meta\.site_publico \|\| \{\}/);
  assert.match(page, /selectPublicTestimonials\(site, googleReviews\)/);
});

test("depoimentos gravados no tenant demo continuam visíveis somente nele", () => {
  const demoSaved = [{ nome: "Pessoa Demo", texto: "Relato de demonstração" }];
  assert.deepEqual(selectPublicTestimonials({ depoimentos: demoSaved }, { reviews: [] }), demoSaved);
  assert.deepEqual(selectPublicTestimonials({ depoimentos: [] }, { reviews: [] }), []);
});

test("falha na consulta da clínica não é substituída por depoimentos fictícios", async () => {
  const page = await readFile(pagePath, "utf8");
  assert.match(page, /if \(error\) throw error;/);
  assert.deepEqual(selectPublicTestimonials(null, null), []);
});

test("falha do Google usa somente depoimentos manuais cadastrados", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = async () => ({ ok: false });

  try {
    const google = await getGooglePlaceReviews({ placeId: "test-place" });
    assert.deepEqual(google.reviews, []);
    const manual = [{ nome: "Cliente real", texto: "Relato real" }];
    assert.deepEqual(selectPublicTestimonials({ depoimentos: manual }, google), manual);
    assert.deepEqual(selectPublicTestimonials({ depoimentos: [] }, google), []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  }
});

test("avaliação do Google sem autor ou nota não inventa identidade nem estrelas", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ reviews: [{ text: { text: "Relato público" } }] }) });

  try {
    const google = await getGooglePlaceReviews({ placeId: "test-place" });
    assert.equal(google.reviews.length, 1);
    assert.equal(google.reviews[0].nome, "");
    assert.equal(google.reviews[0].texto, "Relato público");
    assert.equal(testimonialRating(google.reviews[0].rating), null);
    assert.equal(testimonialRating(5), 5);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  }
});

test("cadastro manual mantém campos e persistência por clínica", async () => {
  const settings = await readFile(settingsPath, "utf8");
  const actions = await readFile(actionsPath, "utf8");
  assert.match(settings, /site\.depoimentos\?\.\[index - 1\]/);
  assert.match(settings, /depoimento_\$\{index\}_nome/);
  assert.match(settings, /depoimento_\$\{index\}_procedimento/);
  assert.match(settings, /depoimento_\$\{index\}_texto/);
  assert.match(actions, /const depoimentos = \[1, 2, 3, 4\]\.map/);
  assert.match(actions, /site_publico: \{[\s\S]*?depoimentos,/);
  assert.match(actions, /\.eq\("id", clinicaId\)/);
});
