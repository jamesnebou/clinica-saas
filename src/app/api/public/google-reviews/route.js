import { supabaseAdmin } from "@/lib/supabase/admin";
import { getGooglePlaceReviews } from "@/lib/google/places";
import { consumePublicRateLimit, noStoreJson, publicRateLimitResponse } from "@/lib/security/public-antiabuse";
import { isValidPublicSlug } from "@/lib/security/public-antiabuse-core.mjs";
import { googlePlacesAutomationEnabled } from "@/lib/google/automation-mode.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!googlePlacesAutomationEnabled()) return noStoreJson({ error: "Integração automática desativada." }, { status: 404 });
  const url = new URL(request.url);
  const slug = String(url.searchParams.get("slug") || "").trim();
  if (!isValidPublicSlug(slug) || url.searchParams.has("clinica_id") || url.searchParams.has("tenant_id")) {
    return noStoreJson({ error: "Clínica inválida." }, { status: 400 });
  }
  const { data: clinic, error } = await supabaseAdmin.from("clinicas")
    .select("id, status, metadata").eq("slug", slug).in("status", ["trial", "ativa"]).maybeSingle();
  if (error) return noStoreJson({ error: "Consulta indisponível." }, { status: 503 });
  const site = clinic?.metadata?.site_publico;
  if (!clinic || site?.publicado === false || !site?.google_reviews_ativo || !site?.google_place_id) {
    return noStoreJson({ error: "Avaliações indisponíveis." }, { status: 404 });
  }
  const rateLimit = await consumePublicRateLimit({ scope: "google_reviews_read", headers: request.headers, tenantId: clinic.id });
  if (!rateLimit.allowed) return publicRateLimitResponse(rateLimit);
  return noStoreJson(await getGooglePlaceReviews({ placeId: site.google_place_id, limit: 5 }));
}
