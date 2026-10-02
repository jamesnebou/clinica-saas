import { revalidatePath } from "next/cache";
import { requireClinicSection } from "@/lib/auth/session";
import { getGooglePlaceDetails, searchGooglePlaces } from "@/lib/google/places";
import { updateClinicPlaceLink } from "@/lib/google/clinic-place-link.mjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { consumePublicRateLimit, noStoreJson, publicRateLimitResponse } from "@/lib/security/public-antiabuse";
import { readBoundedJson } from "@/lib/security/public-antiabuse-core.mjs";
import { googlePlacesAutomationEnabled } from "@/lib/google/automation-mode.mjs";

export const dynamic = "force-dynamic";

async function authorizedClinic() {
  const context = await requireClinicSection("configuracoes");
  const clinicId = context.activeClinic?.id;
  const membership = context.memberships?.find((item) => item.clinica_id === clinicId);
  if (!clinicId || !["owner", "admin"].includes(membership?.papel)) return null;
  return clinicId;
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function GET(request) {
  if (!googlePlacesAutomationEnabled()) return noStoreJson({ error: "Integração automática desativada." }, { status: 404 });
  const clinicId = await authorizedClinic();
  if (!clinicId) return noStoreJson({ error: "Acesso não autorizado." }, { status: 403 });
  const url = new URL(request.url);
  if (url.searchParams.has("clinica_id") || url.searchParams.has("tenant_id")) {
    return noStoreJson({ error: "Parâmetro não permitido." }, { status: 400 });
  }
  const query = String(url.searchParams.get("q") || "").trim();
  if (query.length < 3 || query.length > 120) return noStoreJson({ error: "Digite entre 3 e 120 caracteres." }, { status: 400 });
  const rateLimit = await consumePublicRateLimit({ scope: "google_places_search", headers: request.headers, tenantId: clinicId });
  if (!rateLimit.allowed) return publicRateLimitResponse(rateLimit);
  try {
    return noStoreJson({ places: await searchGooglePlaces(query) });
  } catch (error) {
    return noStoreJson({ error: error.message || "Busca indisponível." }, { status: 503 });
  }
}

export async function POST(request) {
  if (!googlePlacesAutomationEnabled()) return noStoreJson({ error: "Integração automática desativada." }, { status: 404 });
  const clinicId = await authorizedClinic();
  if (!clinicId) return noStoreJson({ error: "Acesso não autorizado." }, { status: 403 });
  if (!sameOrigin(request) || !request.headers.get("content-type")?.startsWith("application/json")) {
    return noStoreJson({ error: "Requisição inválida." }, { status: 403 });
  }
  const parsed = await readBoundedJson(request, 1024);
  if (!parsed.ok) return noStoreJson({ error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  if (body?.clinica_id || body?.tenant_id || !/^[\w-]{8,256}$/.test(String(body?.placeId || ""))) {
    return noStoreJson({ error: "Estabelecimento inválido." }, { status: 400 });
  }
  const rateLimit = await consumePublicRateLimit({ scope: "google_places_search", headers: request.headers, tenantId: clinicId });
  if (!rateLimit.allowed) return publicRateLimitResponse(rateLimit);
  try {
    const result = await updateClinicPlaceLink({ database: supabaseAdmin, clinicId, placeId: body.placeId, verifyPlace: getGooglePlaceDetails });
    revalidatePath("/dashboard/configuracoes");
    revalidatePath(`/c/${result.slug}`);
    return noStoreJson({ ok: true });
  } catch (error) {
    return noStoreJson({ error: error.message || "Não foi possível conectar." }, { status: 503 });
  }
}

export async function DELETE(request) {
  if (!googlePlacesAutomationEnabled()) return noStoreJson({ error: "Integração automática desativada." }, { status: 404 });
  const clinicId = await authorizedClinic();
  if (!clinicId) return noStoreJson({ error: "Acesso não autorizado." }, { status: 403 });
  if (!sameOrigin(request)) return noStoreJson({ error: "Requisição inválida." }, { status: 403 });
  try {
    const result = await updateClinicPlaceLink({ database: supabaseAdmin, clinicId });
    revalidatePath("/dashboard/configuracoes");
    revalidatePath(`/c/${result.slug}`);
    return noStoreJson({ ok: true });
  } catch {
    return noStoreJson({ error: "Não foi possível desconectar." }, { status: 503 });
  }
}
