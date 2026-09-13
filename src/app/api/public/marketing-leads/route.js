import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  consumePublicRateLimit,
  noStoreJson,
  publicRateLimitResponse,
  publicRequestFingerprint,
  trustedPublicRequestIp,
} from "@/lib/security/public-antiabuse";
import { looksLikeAutomatedForm, readBoundedJson } from "@/lib/security/public-antiabuse-core.mjs";
import {
  allowsMarketing,
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
import { hasContactConsent } from "@/lib/tracking/marketing-lead.mjs";

export const runtime = "nodejs";

const PLANS = new Set(["starter", "growth", "premium", "nao_sei"]);

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
    const parsed = await readBoundedJson(request, 32_768);
    if (!parsed.ok) return noStoreJson({ ok: false, error: parsed.error }, { status: parsed.status });
    const body = parsed.value;
    const limits = { name: 100, whatsapp: 40, email: 254, clinic_name: 120, session_id: 100, meta_event_id: 160 };
    if (Object.entries(limits).some(([key, max]) => body[key] != null && (typeof body[key] !== "string" || body[key].length > max))) {
      return noStoreJson({ ok: false, error: "Dados inválidos." }, { status: 400 });
    }
    if (looksLikeAutomatedForm(body)) return noStoreJson({ ok: true });

    const nome = cleanText(body.name, 100);
    const whatsapp = String(body.whatsapp || "").replace(/\D/g, "").slice(0, 15);
    const email = cleanText(body.email, 254)?.toLowerCase() || null;
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return noStoreJson({ ok: false, error: "Dados inválidos." }, { status: 400 });
    const profissionais = Math.min(500, Math.max(1, Number.parseInt(body.professionals_count, 10) || 1));
    const plano = PLANS.has(body.plan_interest) ? body.plan_interest : "nao_sei";
    const attribution = normalizeMarketingAttribution(body);
    const segment = cleanText(body.segment || attribution.segment, 120);

    if (!nome || nome.length < 2) return noStoreJson({ ok: false, error: "Informe seu nome." }, { status: 400 });
    if (whatsapp.length < 10) return noStoreJson({ ok: false, error: "Informe um WhatsApp válido com DDD." }, { status: 400 });
    if (!hasContactConsent(body)) return noStoreJson({ ok: false, error: "Autorize o contato para continuar." }, { status: 400 });

    const rateLimit = await consumePublicRateLimit({ scope: "marketing_leads", headers: request.headers, target: whatsapp });
    if (!rateLimit.allowed) return publicRateLimitResponse(rateLimit);
    const ipHash = publicRequestFingerprint(request.headers);

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
      gclid: attribution.gclid || null,
      gbraid: attribution.gbraid || null,
      wbraid: attribution.wbraid || null,
      consent: attribution.consent,
      first_touch: attribution.first_touch || {},
      last_touch: attribution.last_touch || {},
      segmento_interesse: segment || null,
      meta_lead_event_id: preInsertEventId,
      metadata: {
        user_agent: cleanText(request.headers.get("user-agent"), 300),
        attribution_version: 3,
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
      gclid: attribution.gclid || null,
      gbraid: attribution.gbraid || null,
      wbraid: attribution.wbraid || null,
      consent: attribution.consent,
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
        clientIpAddress: trustedPublicRequestIp(request.headers),
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

    if (allowsMarketing(attribution)) {
      let queueRecord = null;
      try {
        const queued = await enqueueMetaConversionEvent(capiInput);
        queueRecord = queued.record;
        scheduleDelivery(queueRecord, null);
      } catch (queueError) {
        if (!queueError?.trackingQueueUnavailable) throw queueError;
        scheduleDelivery(null, capiInput);
      }
    }

    return noStoreJson({ ok: true, lead_id: data.id, event_id: eventId });
  } catch (error) {
    console.error("marketing_lead_submit_failed", { code: error?.code || "unknown" });
    return noStoreJson({ ok: false, error: "Não foi possível enviar agora. Tente novamente." }, { status: 500 });
  }
}
