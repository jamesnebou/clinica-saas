import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  cleanText,
  deterministicMetaEventId,
  isValidMetaEventId,
  normalizeMarketingAttribution,
  splitPersonName,
} from "@/lib/tracking/core.mjs";
import { buildMetaUserData } from "@/lib/tracking/meta-capi";
import {
  deliverMetaConversionRecord,
  enqueueMetaConversionEvent,
  queueAndDeliverMetaConversionEvent,
} from "@/lib/tracking/service";

export const runtime = "nodejs";

const PLANS = new Set(["starter", "growth", "premium", "nao_sei"]);

function requestIp(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function requestHash(request) {
  const ip = requestIp(request);
  const salt = process.env.LEAD_HASH_SALT || process.env.CLINIC_SECRETS_KEY || "nexawi-clinicas-public-lead";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function eventSourceUrl(request, attribution) {
  const path = cleanText(attribution?.first_page || attribution?.last_touch?.landing_page || attribution?.first_touch?.landing_page, 500) || "/";
  try {
    return new URL(path, request.nextUrl.origin).toString();
  } catch {
    return request.nextUrl.origin;
  }
}

function scheduleDelivery(record, fallbackInput) {
  after(async () => {
    try {
      if (record?.id) await deliverMetaConversionRecord(record);
      else if (fallbackInput) await queueAndDeliverMetaConversionEvent(fallbackInput);
    } catch (error) {
      console.error("meta_capi_lead_delivery_failed", { code: error?.code || "unknown" });
    }
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (cleanText(body.website)) return NextResponse.json({ ok: true });

    const nome = cleanText(body.name, 100);
    const whatsapp = String(body.whatsapp || "").replace(/\D/g, "").slice(0, 15);
    const email = cleanText(body.email, 160)?.toLowerCase() || null;
    const profissionais = Math.min(500, Math.max(1, Number.parseInt(body.professionals_count, 10) || 1));
    const plano = PLANS.has(body.plan_interest) ? body.plan_interest : "nao_sei";
    const attribution = normalizeMarketingAttribution(body);
    const segment = cleanText(body.segment || attribution.segment, 120);

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

    const requestedEventId = cleanText(body.meta_event_id, 160);
    const preInsertEventId = isValidMetaEventId(requestedEventId) ? requestedEventId : null;
    const { data, error } = await supabaseAdmin.from("clinica_marketing_leads").insert({
      nome,
      whatsapp,
      email,
      clinica_nome: cleanText(body.clinic_name, 120),
      profissionais_qtd: profissionais,
      plano_interesse: plano,
      origem: attribution.utm_source || "site",
      utm_source: attribution.utm_source || null,
      utm_medium: attribution.utm_medium || null,
      utm_campaign: attribution.utm_campaign || null,
      utm_content: attribution.utm_content || null,
      utm_term: attribution.utm_term || null,
      session_id: cleanText(body.session_id, 100),
      pagina: attribution.first_page || "/",
      referrer: attribution.first_referrer || null,
      ip_hash: ipHash,
      fbclid: attribution.fbclid || null,
      fbc: attribution.fbc || null,
      fbp: attribution.fbp || null,
      first_touch: attribution.first_touch || {},
      last_touch: attribution.last_touch || {},
      segmento_interesse: segment || null,
      meta_lead_event_id: preInsertEventId,
      metadata: {
        user_agent: cleanText(request.headers.get("user-agent"), 300),
        attribution_version: 2,
      },
    }).select("id").single();

    if (error) throw error;

    const eventId = preInsertEventId || deterministicMetaEventId("lead", data.id);
    if (!preInsertEventId) {
      await supabaseAdmin.from("clinica_marketing_leads").update({ meta_lead_event_id: eventId }).eq("id", data.id);
    }

    await supabaseAdmin.from("clinica_marketing_eventos").insert({
      event_name: "lead_submit",
      session_id: cleanText(body.session_id, 100),
      lead_id: data.id,
      pagina: attribution.first_page || "/",
      referrer: attribution.first_referrer || null,
      utm_source: attribution.utm_source || null,
      utm_medium: attribution.utm_medium || null,
      utm_campaign: attribution.utm_campaign || null,
      utm_content: attribution.utm_content || null,
      utm_term: attribution.utm_term || null,
      metadata: {
        plano_interesse: plano,
        profissionais_qtd: profissionais,
        segment: segment || null,
        meta_event_id: eventId,
      },
      ip_hash: ipHash,
    });

    const { firstName, lastName } = splitPersonName(nome);
    const capiInput = {
      eventName: "Lead",
      eventId,
      eventTime: new Date(),
      eventSourceUrl: eventSourceUrl(request, attribution),
      userData: buildMetaUserData({
        email,
        phone: whatsapp,
        firstName,
        lastName,
        externalId: data.id,
        fbc: attribution.fbc,
        fbp: attribution.fbp,
        clientIpAddress: requestIp(request),
        clientUserAgent: request.headers.get("user-agent"),
      }),
      customData: {
        segment,
        page_type: attribution.page_type || "marketing_lead_form",
        plan: plano !== "nao_sei" ? plano : null,
        lead_source: attribution.utm_source || "site",
      },
      marketingLeadId: data.id,
      sourceType: "marketing_lead",
      sourceId: data.id,
    };

    let queueRecord = null;
    try {
      const queued = await enqueueMetaConversionEvent(capiInput);
      queueRecord = queued.record;
      scheduleDelivery(queueRecord, null);
    } catch (queueError) {
      if (!queueError?.trackingQueueUnavailable) throw queueError;
      scheduleDelivery(null, capiInput);
    }

    return NextResponse.json({ ok: true, lead_id: data.id, event_id: eventId });
  } catch (error) {
    console.error("marketing_lead_submit_failed", { code: error?.code || "unknown" });
    return NextResponse.json({ error: "Não foi possível enviar agora. Tente novamente." }, { status: 500 });
  }
}
