import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  cleanText,
  isValidMetaEventId,
  normalizeMarketingAttribution,
  sanitizeInternalMetadata,
} from "@/lib/tracking/core.mjs";
import { buildMetaUserData, sendMetaConversionEvent } from "@/lib/tracking/meta-capi";

export const runtime = "nodejs";

const EVENTS = new Set([
  "landing_view",
  "demo_click",
  "demo_access",
  "pricing_click",
  "whatsapp_click",
  "lead_submit",
  "roi_calculate",
  "demo_module_view",
  "demo_cta_click",
  "hero_secondary_click",
]);

function requestIp(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function sourceUrl(request, page) {
  try {
    return new URL(cleanText(page, 500) || "/", request.nextUrl.origin).toString();
  } catch {
    return request.nextUrl.origin;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!EVENTS.has(body.event_name)) return NextResponse.json({ ok: false }, { status: 400 });

    const ip = requestIp(request);
    const salt = process.env.LEAD_HASH_SALT || process.env.CLINIC_SECRETS_KEY || "nexawi-clinicas-public-event";
    const ipHash = createHash("sha256").update(`${salt}:${ip}`).digest("hex");
    const metadata = sanitizeInternalMetadata(body.metadata);
    const attribution = normalizeMarketingAttribution(body);
    const page = cleanText(body.page, 500) || attribution.last_touch?.landing_page || attribution.first_page || "/";
    const eventId = isValidMetaEventId(body.meta_event_id) ? body.meta_event_id : null;

    const { error } = await supabaseAdmin.from("clinica_marketing_eventos").insert({
      event_name: body.event_name,
      session_id: cleanText(body.session_id, 100),
      pagina: page,
      referrer: cleanText(body.referrer, 500),
      utm_source: attribution.utm_source || null,
      utm_medium: attribution.utm_medium || null,
      utm_campaign: attribution.utm_campaign || null,
      utm_content: attribution.utm_content || null,
      utm_term: attribution.utm_term || null,
      metadata: { ...metadata, ...(eventId ? { meta_event_id: eventId } : {}) },
      ip_hash: ipHash,
    });
    if (error) throw error;

    // Somente a visualização de uma superfície de aquisição vira evento padrão Meta aqui.
    // Eventos internos como demo_click/pricing_click continuam apenas no analytics da NexaWi.
    if (body.event_name === "landing_view" && eventId) {
      const viewInput = {
        eventName: "ViewContent",
        eventId,
        eventTime: new Date(),
        eventSourceUrl: sourceUrl(request, page),
        userData: buildMetaUserData({
          fbc: attribution.fbc,
          fbp: attribution.fbp,
          clientIpAddress: ip,
          clientUserAgent: request.headers.get("user-agent"),
        }),
        customData: {
          segment: metadata.segment || attribution.segment,
          page_type: metadata.page_type || attribution.page_type || "marketing",
          content_name: metadata.content_name || "NexaWi Clínicas",
          content_category: metadata.content_category || "SaaS B2B",
        },
      };
      after(async () => {
        const result = await sendMetaConversionEvent(viewInput);
        if (!result.ok && !result.skipped) {
          console.error("meta_capi_view_content_failed", { code: result.code || "unknown" });
        }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("marketing_event_register_failed", { code: error?.code || "unknown" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
