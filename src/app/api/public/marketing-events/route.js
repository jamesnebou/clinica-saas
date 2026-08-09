import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EVENTS = new Set(["landing_view", "demo_click", "demo_access", "pricing_click", "whatsapp_click", "lead_submit", "roi_calculate", "demo_module_view", "demo_cta_click"]);

function clean(value, max = 120) {
  return String(value || "").trim().slice(0, max) || null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!EVENTS.has(body.event_name)) return NextResponse.json({ ok: false }, { status: 400 });

    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
    const salt = process.env.LEAD_HASH_SALT || process.env.CLINIC_SECRETS_KEY || "nexawi-clinicas-public-event";
    const ipHash = createHash("sha256").update(`${salt}:${ip}`).digest("hex");
    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};

    const { error } = await supabaseAdmin.from("clinica_marketing_eventos").insert({
      event_name: body.event_name,
      session_id: clean(body.session_id, 100),
      pagina: clean(body.page, 240),
      referrer: clean(body.referrer, 500),
      utm_source: clean(body.utm_source),
      utm_medium: clean(body.utm_medium),
      utm_campaign: clean(body.utm_campaign),
      utm_content: clean(body.utm_content),
      utm_term: clean(body.utm_term),
      metadata,
      ip_hash: ipHash,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao registrar evento de marketing:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
