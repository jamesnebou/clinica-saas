import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getGooglePlaceDetails, getGooglePlaceReviews, searchGooglePlaces } from "../src/lib/google/places.js";
import { updateClinicPlaceLink } from "../src/lib/google/clinic-place-link.mjs";
import { selectPublicTestimonials } from "../src/lib/public-testimonials.mjs";

process.env.GOOGLE_MAPS_API_KEY = "test-server-only-key";
const placeId = "ChIJtestplace12345";
const ok = (value) => ({ ok: true, json: async () => value });
const review = (index) => ({
  rating: 5,
  text: { text: `Avaliação ${index}` },
  authorAttribution: { displayName: `Autora ${index}`, uri: `https://www.google.com/maps/contrib/${index}` },
  googleMapsUri: `https://www.google.com/maps/reviews/${index}`,
});

function fakeDatabase(initial) {
  const rows = structuredClone(initial);
  const calls = [];
  return {
    rows,
    calls,
    from(table) {
      assert.equal(table, "clinicas");
      let update = null;
      return {
        select() { return this; },
        update(value) { update = value; return this; },
        eq(field, value) {
          calls.push({ field, value, update: Boolean(update) });
          if (update) {
            const row = rows.find((item) => item[field] === value);
            if (row) row.metadata = update.metadata;
            return Promise.resolve({ error: null });
          }
          return this;
        },
        maybeSingle() {
          const last = calls.at(-1);
          return Promise.resolve({ data: rows.find((item) => item[last.field] === last.value) || null, error: null });
        },
      };
    },
  };
}

test("1. busca retorna empresas reais com endereço e métricas disponíveis", async () => {
  let request;
  const places = await searchGooglePlaces("Ingrid Silva Cândido Sales", { fetchImpl: async (url, init) => {
    request = { url, init };
    return ok({ places: [{ id: placeId, displayName: { text: "Ingrid Silva" }, formattedAddress: "Cândido Sales - BA", rating: 4.9, userRatingCount: 127 }] });
  } });
  assert.equal(places[0].name, "Ingrid Silva");
  assert.equal(places[0].address, "Cândido Sales - BA");
  assert.equal(places[0].userRatingCount, 127);
  assert.match(request.url, /searchText$/);
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.headers["X-Goog-Api-Key"], "test-server-only-key");
});

test("2. confirmação valida Place ID no Google e grava no tenant da sessão", async () => {
  const database = fakeDatabase([{ id: "clinic-a", slug: "a", metadata: { site_publico: { depoimentos: [{ texto: "Manual" }] } } }]);
  const checked = await getGooglePlaceDetails(placeId, { fetchImpl: async () => ok({ id: placeId, displayName: { text: "Ingrid" } }) });
  const result = await updateClinicPlaceLink({ database, clinicId: "clinic-a", placeId, verifyPlace: async (value) => { assert.equal(value, checked.id); } });
  assert.equal(result.connected, true);
  assert.equal(database.rows[0].metadata.site_publico.google_place_id, placeId);
  assert.deepEqual(database.rows[0].metadata.site_publico.depoimentos, [{ texto: "Manual" }]);
});

test("3. payload de outra clínica é recusado e a escrita usa somente o ID da sessão", async () => {
  const route = await readFile(new URL("../src/app/api/dashboard/google-places/route.js", import.meta.url), "utf8");
  assert.match(route, /body\?\.clinica_id \|\| body\?\.tenant_id/);
  assert.match(route, /clinicId = await authorizedClinic\(\)/);
  const database = fakeDatabase([{ id: "clinic-a", slug: "a", metadata: {} }, { id: "clinic-b", slug: "b", metadata: {} }]);
  await updateClinicPlaceLink({ database, clinicId: "clinic-a", placeId, verifyPlace: async () => {} });
  assert.equal(database.rows[1].metadata.site_publico, undefined);
  assert.deepEqual(database.calls.filter((call) => call.update).map((call) => call.value), ["clinic-a"]);
});

test("4. cinco avaliações retornadas ficam disponíveis", async () => {
  const result = await getGooglePlaceReviews({ placeId, fetchImpl: async () => ok({ reviews: [1, 2, 3, 4, 5].map(review) }) });
  assert.equal(result.reviews.length, 5);
  assert.equal(result.reviews[4].googleMapsUri, "https://www.google.com/maps/reviews/5");
});

test("5. menos de cinco avaliações não é completado artificialmente", async () => {
  const result = await getGooglePlaceReviews({ placeId, fetchImpl: async () => ok({ reviews: [review(1), review(2)] }) });
  assert.equal(result.reviews.length, 2);
});

test("6. zero avaliações não cria depoimentos", async () => {
  const result = await getGooglePlaceReviews({ placeId, fetchImpl: async () => ok({ reviews: [] }) });
  assert.deepEqual(result.reviews, []);
});

test("7. falha do Google mantém depoimentos manuais", async () => {
  const result = await getGooglePlaceReviews({ placeId, fetchImpl: async () => { throw new Error("offline"); } });
  const manual = [{ texto: "Atendimento real" }];
  assert.deepEqual(selectPublicTestimonials({ depoimentos: manual }, result), manual);
});

test("8. Google e manual têm renderização e atribuição separadas", async () => {
  const component = await readFile(new URL("../src/app/c/[slug]/testimonials-section.js", import.meta.url), "utf8");
  assert.match(component, /const googleItems =/);
  assert.match(component, /const manualItems =/);
  assert.match(component, /Depoimentos da clínica/);
  assert.match(component, /item\.googleMapsUri/);
  assert.match(component, /manualItems\.map/);
});

test("9. sem Google, depoimento manual continua", () => {
  const manual = [{ texto: "Experiência verdadeira" }];
  assert.deepEqual(selectPublicTestimonials({ depoimentos: manual }, { reviews: [] }), manual);
});

test("10. sem Google e sem manual, seção não é renderizada", async () => {
  const component = await readFile(new URL("../src/app/c/[slug]/testimonials-section.js", import.meta.url), "utf8");
  assert.match(component, /if \(!connected && !manualItems\.length\) return null/);
  assert.deepEqual(selectPublicTestimonials({ depoimentos: [] }, { reviews: [] }), []);
});

test("11. desconectar limpa vínculo e preserva manual", async () => {
  const manual = [{ nome: "Cliente", texto: "Relato" }];
  const database = fakeDatabase([{ id: "clinic-a", slug: "a", metadata: { site_publico: { google_place_id: placeId, google_reviews_ativo: true, depoimentos: manual } } }]);
  const result = await updateClinicPlaceLink({ database, clinicId: "clinic-a" });
  assert.equal(result.connected, false);
  assert.equal(database.rows[0].metadata.site_publico.google_place_id, null);
  assert.deepEqual(database.rows[0].metadata.site_publico.depoimentos, manual);
});

test("12. campos opcionais ausentes não inventam autoria, nota, data ou link", async () => {
  const result = await getGooglePlaceReviews({ placeId, fetchImpl: async () => ok({ reviews: [{ text: { text: "Texto" } }] }) });
  assert.equal(result.reviews[0].nome, "");
  assert.equal(result.reviews[0].rating, null);
  assert.equal(result.reviews[0].authorPhotoUri, null);
  assert.equal(result.reviews[0].googleMapsUri, null);
  assert.equal(result.reviews[0].relativeTime, "");
});
