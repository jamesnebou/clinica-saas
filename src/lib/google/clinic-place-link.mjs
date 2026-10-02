export async function updateClinicPlaceLink({ database, clinicId, placeId = null, verifyPlace }) {
  if (!clinicId) throw new Error("Clínica não identificada.");
  const { data: clinic, error: readError } = await database.from("clinicas")
    .select("id, slug, metadata").eq("id", clinicId).maybeSingle();
  if (readError) throw readError;
  if (!clinic || clinic.id !== clinicId) throw new Error("Clínica não encontrada.");

  if (placeId) await verifyPlace(placeId);
  const metadata = clinic.metadata || {};
  const site = metadata.site_publico || {};
  const nextMetadata = {
    ...metadata,
    site_publico: {
      ...site,
      google_place_id: placeId,
      google_reviews_ativo: Boolean(placeId),
      google_reviews_url: null,
    },
  };
  const { error: writeError } = await database.from("clinicas")
    .update({ metadata: nextMetadata }).eq("id", clinicId);
  if (writeError) throw writeError;
  return { slug: clinic.slug, connected: Boolean(placeId) };
}
