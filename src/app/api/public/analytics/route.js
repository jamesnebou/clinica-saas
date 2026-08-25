import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ALLOWED_EVENTS = new Set(["page_view", "cta_click", "booking_started", "product_view", "store_view"]);

function short(value, max = 300) {
  return String(value || "").trim().slice(0, max);
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Payload inválido." }, { status: 400 }); }
  const slug = short(body?.slug, 120);
  const eventName = short(body?.eventName, 60);
  if (!slug || !ALLOWED_EVENTS.has(eventName)) return NextResponse.json({ error: "Evento inválido." }, { status: 400 });

  const { data: clinic } = await supabaseAdmin.from("clinicas").select("id").eq("slug", slug).in("status", ["trial", "ativa"]).maybeSingle();
  if (!clinic) return NextResponse.json({ ok: true });
  const attribution = body?.attribution || {};
  const sessionId = short(body?.sessionId, 100);
  const eventId = crypto.randomUUID();
  const { error } = await supabaseAdmin.from("eventos_analiticos").insert({
    clinica_id: clinic.id,
    event_name: eventName,
    session_id: sessionId || null,
    source: short(attribution.source, 120) || null,
    medium: short(attribution.medium, 120) || null,
    campaign: short(attribution.campaign, 160) || null,
    content: short(attribution.content, 160) || null,
    term: short(attribution.term, 160) || null,
    referrer: short(attribution.referrer, 500) || null,
    landing_page: short(attribution.landing_page, 500) || null,
    metadata: {
      path: short(body?.metadata?.path, 300) || null,
      label: short(body?.metadata?.label, 100) || null,
      target: short(body?.metadata?.target, 300) || null,
    },
    idempotency_key: `${sessionId || eventId}:${eventName}:${short(body?.metadata?.path || body?.metadata?.target, 180)}`,
  });
  if (error && error.code !== "23505") return NextResponse.json({ error: "Falha ao registrar evento." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
