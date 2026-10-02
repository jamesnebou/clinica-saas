function hasTestimonialText(item) {
  return typeof item?.texto === "string" && item.texto.trim().length > 0;
}

export function selectPublicTestimonials(site, googleReviews) {
  const manual = Array.isArray(site?.depoimentos) ? site.depoimentos.filter(hasTestimonialText) : [];
  const google = Array.isArray(googleReviews?.reviews) ? googleReviews.reviews.filter(hasTestimonialText) : [];
  return google.length ? google : manual;
}

export function testimonialRating(value) {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}
