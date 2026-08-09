import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const PLANS = new Set(["starter", "growth", "premium", "nao_sei"]);

function clean(value, max = 120) {
  return String(value || "").trim().slice(0, max) || null;
}

function requestHash(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.LEAD_HASH_SALT || process.env.CLINIC_SECRETS_KEY || "nexawi-clinicas-public-lead";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (clean(body.website)) return NextResponse.json({ ok: true });

    const nome = clean(body.name, 100);
    const whatsapp = String(body.whatsapp || "").replace(/\D/g, "").slice(0, 15);
    const email = clean(body.email, 160)?.toLowerCase() || null;
    const profissionais = Math.min(500, Math.max(1, Number.parseInt(body.professionals_count, 10) || 1));
    const plano = PLANS.has(body.plan_interest) ? body.plan_interest : "nao_sei";

    if (!nome || nome.length < 2) return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });
    if (whatsapp.length < 10) return NextResponse.json({ error: "Informe um WhatsApp válido com DDD." }, { status: 400 });
    if (body.consent !== "on" && body.consent !== true) return NextResponse.json({ error: "Autorize o contato para continuar." }, { status: 400 });

    const ipHash = requestHash(request);
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("clinica_marketing_leads")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", twoMinutesAgo);

    if ((count || 0) >= 3) return NextResponse.json({ error: "Aguarde alguns minutos antes de enviar novamente." }, { status: 429 });

    const { data, error } = await supabaseAdmin.from("clinica_marketing_leads").insert({
      nome,
      whatsapp,
      email,
      clinica_nome: clean(body.clinic_name, 120),
      profissionais_qtd: profissionais,
      plano_interesse: plano,
      origem: clean(body.utm_source, 120) || "site",
      utm_source: clean(body.utm_source),
      utm_medium: clean(body.utm_medium),
      utm_campaign: clean(body.utm_campaign),
      utm_content: clean(body.utm_content),
      utm_term: clean(body.utm_term),
      session_id: clean(body.session_id, 100),
      pagina: clean(body.first_page, 240) || "/",
      referrer: clean(body.first_referrer, 500),
      ip_hash: ipHash,
      metadata: { user_agent: clean(request.headers.get("user-agent"), 300) },
    }).select("id").single();

    if (error) throw error;

    await supabaseAdmin.from("clinica_marketing_eventos").insert({
      event_name: "lead_submit",
      session_id: clean(body.session_id, 100),
      lead_id: data.id,
      pagina: clean(body.first_page, 240) || "/",
      utm_source: clean(body.utm_source),
      utm_medium: clean(body.utm_medium),
      utm_campaign: clean(body.utm_campaign),
      metadata: { plano_interesse: plano, profissionais_qtd: profissionais },
      ip_hash: ipHash,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao registrar lead de marketing:", error);
    return NextResponse.json({ error: "Não foi possível enviar agora. Tente novamente." }, { status: 500 });
  }
}
