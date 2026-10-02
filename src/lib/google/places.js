const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places";
const SEARCH_MASK = "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.attributions";
const DETAILS_MASK = "id,displayName,formattedAddress,googleMapsUri,rating,userRatingCount,attributions";
const REVIEWS_MASK = `${DETAILS_MASK},reviews`;

function normalizedText(value) {
  return String(value || "").trim();
}

function googleKey() {
  const key = normalizedText(process.env.GOOGLE_MAPS_API_KEY);
  if (!key) throw new Error("A busca Google está indisponível no momento. Contate o suporte NexaWi.");
  return key;
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function mapAttributions(attributions) {
  return Array.isArray(attributions) ? attributions.map((item) => ({
    provider: normalizedText(item?.provider),
    providerUri: httpsUrl(item?.providerUri),
  })).filter((item) => item.provider) : [];
}

function mapPlace(place) {
  return {
    id: normalizedText(place?.id),
    name: normalizedText(place?.displayName?.text),
    address: normalizedText(place?.formattedAddress),
    rating: Number.isFinite(place?.rating) ? place.rating : null,
    userRatingCount: Number.isInteger(place?.userRatingCount) ? place.userRatingCount : null,
    googleMapsUri: httpsUrl(place?.googleMapsUri),
    attributions: mapAttributions(place?.attributions),
  };
}

async function readGoogleResponse(response) {
  if (!response.ok) throw new Error("O Google não respondeu à consulta. Tente novamente em instantes.");
  return response.json();
}

export async function searchGooglePlaces(query, { fetchImpl = fetch } = {}) {
  const text = normalizedText(query);
  if (text.length < 3 || text.length > 120) throw new Error("Digite entre 3 e 120 caracteres para pesquisar.");
  const response = await fetchImpl(`${GOOGLE_PLACES_URL}:searchText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": googleKey(), "X-Goog-FieldMask": SEARCH_MASK },
    body: JSON.stringify({ textQuery: text, languageCode: "pt-BR", regionCode: "BR", pageSize: 8 }),
    cache: "no-store",
  });
  const data = await readGoogleResponse(response);
  return (Array.isArray(data.places) ? data.places : []).map(mapPlace).filter((place) => place.id && place.name);
}

export async function getGooglePlaceDetails(placeId, { fetchImpl = fetch } = {}) {
  const id = normalizedText(placeId);
  if (!/^[\w-]{8,256}$/.test(id)) throw new Error("Estabelecimento inválido. Faça a pesquisa novamente.");
  const response = await fetchImpl(`${GOOGLE_PLACES_URL}/${encodeURIComponent(id)}?languageCode=pt-BR`, {
    headers: { "X-Goog-Api-Key": googleKey(), "X-Goog-FieldMask": DETAILS_MASK },
    cache: "no-store",
  });
  const place = mapPlace(await readGoogleResponse(response));
  if (place.id !== id || !place.name) throw new Error("Não foi possível confirmar esse estabelecimento no Google.");
  return place;
}

function mapReview(review) {
  const author = review?.authorAttribution || {};
  return {
    nome: normalizedText(author.displayName),
    texto: normalizedText(review?.text?.text || review?.originalText?.text),
    rating: Number.isInteger(review?.rating) && review.rating >= 1 && review.rating <= 5 ? review.rating : null,
    authorUri: httpsUrl(author.uri),
    authorPhotoUri: httpsUrl(author.photoUri),
    googleMapsUri: httpsUrl(review?.googleMapsUri),
    relativeTime: normalizedText(review?.relativePublishTimeDescription),
    translated: Boolean(review?.text?.text && review?.originalText?.text && review.text.text !== review.originalText.text),
    visitDate: review?.visitDate?.year && review?.visitDate?.month
      ? { year: review.visitDate.year, month: review.visitDate.month } : null,
  };
}

export async function getGooglePlaceReviews({ placeId, limit = 5, fetchImpl = fetch } = {}) {
  const empty = { reviews: [], rating: null, userRatingCount: null, googleMapsUri: null, attributions: [] };
  const id = normalizedText(placeId);
  if (!id || !/^[\w-]{8,256}$/.test(id)) return empty;
  try {
    const response = await fetchImpl(`${GOOGLE_PLACES_URL}/${encodeURIComponent(id)}?languageCode=pt-BR`, {
      headers: { "X-Goog-Api-Key": googleKey(), "X-Goog-FieldMask": REVIEWS_MASK },
      cache: "no-store",
    });
    const raw = await readGoogleResponse(response);
    const place = mapPlace(raw);
    return {
      ...place,
      reviews: (Array.isArray(raw.reviews) ? raw.reviews : []).map(mapReview).filter((review) => review.texto).slice(0, Math.min(5, Math.max(0, limit))),
    };
  } catch {
    return empty;
  }
}
