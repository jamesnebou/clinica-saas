import { supabaseAdmin } from "@/lib/supabase/admin";
import { consumePublicRateLimit, noStoreJson, publicRateLimitResponse } from "@/lib/security/public-antiabuse";
import { isValidPublicSlug, readBoundedJson, safeAnalyticsText, safeAnalyticsPath } from "@/lib/security/public-antiabuse-core.mjs";

const ALLOWED_EVENTS = new Set(["page_view", "cta_click", "booking_started", "product_view", "store_view"]);

function short(value, max = 300) {
  return String(value || "").trim().slice(0, max);
}

export async function POST(request) {
  const parsed = await readBoundedJson(request, 16_384);
  if (!parsed.ok) return noStoreJson({ ok: false, error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  const slug = short(body?.slug, 120);
  const eventName = short(body?.eventName, 60);
  if (!isValidPublicSlug(slug) || !ALLOWED_EVENTS.has(eventName)) return noStoreJson({ ok: false, error: "Evento inválido." }, { status: 400 });

  const { data: clinic } = await supabaseAdmin.from("clinicas").select("id").eq("slug", slug).in("status", ["trial", "ativa"]).maybeSingle();
  if (!clinic) return noStoreJson({ ok: true });
  const rateLimit = await consumePublicRateLimit({ scope: "analytics", headers: request.headers, tenantId: clinic.id });
  if (!rateLimit.allowed) return publicRateLimitResponse(rateLimit);
  const attribution = body?.attribution || {};
  const sessionId = short(body?.sessionId, 100);
  const eventId = crypto.randomUUID();
  const { error } = await supabaseAdmin.from("eventos_analiticos").insert({
    clinica_id: clinic.id,
    event_name: eventName,
    session_id: sessionId || null,
    source: safeAnalyticsText(attribution.source),
    medium: safeAnalyticsText(attribution.medium),
    campaign: safeAnalyticsText(attribution.campaign, 160),
    content: safeAnalyticsText(attribution.content, 160),
    term: safeAnalyticsText(attribution.term, 160),
    referrer: safeAnalyticsPath(attribution.referrer),
    landing_page: safeAnalyticsPath(attribution.landing_page),
    metadata: {
      path: safeAnalyticsPath(body?.metadata?.path),
      label: safeAnalyticsText(body?.metadata?.label, 100),
      target: safeAnalyticsPath(body?.metadata?.target),
    },
    idempotency_key: `${sessionId || eventId}:${eventName}:${safeAnalyticsPath(body?.metadata?.path || body?.metadata?.target) || ""}`,
  });
  if (error && error.code !== "23505") return noStoreJson({ ok: false, error: "Falha ao registrar evento." }, { status: 500 });
  return noStoreJson({ ok: true });
}
