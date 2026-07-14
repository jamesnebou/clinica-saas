const GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";
const GOOGLE_PLACE_FIELD_MASK = "id,displayName,googleMapsUri,rating,userRatingCount,reviews";

function normalizedText(value) {
  return String(value || "").trim();
}

function mapReview(review) {
  const author = review?.authorAttribution || {};
  const text = review?.text?.text || review?.originalText?.text || "";

  return {
    nome: normalizedText(author.displayName) || "Paciente",
    procedimento: review?.relativePublishTimeDescription ? `Google - ${review.relativePublishTimeDescription}` : "Avaliacao Google",
    texto: normalizedText(text),
    rating: Number(review?.rating || 5),
    url: author.uri || null,
  };
}

export async function getGooglePlaceReviews({ placeId, limit = 4 } = {}) {
  const apiKey = normalizedText(process.env.GOOGLE_MAPS_API_KEY);
  const safePlaceId = normalizedText(placeId);

  if (!apiKey || !safePlaceId) {
    return { reviews: [], rating: null, userRatingCount: null, googleMapsUri: null };
  }

  try {
    const response = await fetch(`${GOOGLE_PLACE_DETAILS_URL}/${encodeURIComponent(safePlaceId)}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_PLACE_FIELD_MASK,
      },
      next: { revalidate: 21600 },
    });

    if (!response.ok) {
      return { reviews: [], rating: null, userRatingCount: null, googleMapsUri: null };
    }

    const place = await response.json();
    const reviews = Array.isArray(place.reviews)
      ? place.reviews.map(mapReview).filter((item) => item.texto).slice(0, limit)
      : [];

    return {
      reviews,
      rating: place.rating || null,
      userRatingCount: place.userRatingCount || null,
      googleMapsUri: place.googleMapsUri || null,
    };
  } catch {
    return { reviews: [], rating: null, userRatingCount: null, googleMapsUri: null };
  }
}
