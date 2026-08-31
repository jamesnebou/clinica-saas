import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanText, deterministicMetaEventId, marketingPhoneCandidates, metaRetryDelayMinutes, normalizeMarketingAttribution } from "./core.mjs";
import { buildMetaEventPayload, buildMetaUserData, sendMetaConversionPayload } from "./meta-capi";

const MAX_ATTEMPTS = 6;

function redactPayload(payload = {}) {
  return {
    event_name: payload.event_name || null,
    event_id: payload.event_id || null,
    redacted: true,
  };
}

function nextAttemptIso(attempt) {
  return new Date(Date.now() + metaRetryDelayMinutes(attempt) * 60 * 1000).toISOString();
}

async function loadQueueRecord(id) {
  const { data, error } = await supabaseAdmin.from("meta_conversion_events").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function enqueueMetaConversionEvent({
  eventName,
  eventId,
  eventTime,
  eventSourceUrl,
  userData,
  customData,
  clinicId = null,
  marketingLeadId = null,
  sourceType = "system",
  sourceId = null,
} = {}) {
  const payload = buildMetaEventPayload({ eventName, eventId, eventTime, eventSourceUrl, userData, customData });
  const row = {
    event_name: eventName,
    event_id: eventId,
    clinica_id: clinicId || null,
    marketing_lead_id: marketingLeadId || null,
    source_type: cleanText(sourceType, 80) || "system",
    source_id: cleanText(sourceId, 240),
    payload,
    status: "pending",
    next_attempt_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin.from("meta_conversion_events").insert(row).select("*").single();
  if (!error) return { queued: true, record: data, created: true };

  if (error.code === "23505") {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("meta_conversion_events")
      .select("*")
      .eq("event_name", eventName)
      .eq("event_id", eventId)
      .maybeSingle();
    if (existingError) throw existingError;
    return { queued: Boolean(existing), record: existing, created: false };
  }

  // Deploy antes da migration não deve quebrar uma venda/lead. O chamador pode fazer fallback direto.
  error.trackingQueueUnavailable = true;
  throw error;
}

export async function deliverMetaConversionRecord(recordOrId) {
  const record = typeof recordOrId === "string" ? await loadQueueRecord(recordOrId) : recordOrId;
  if (!record?.id) return { ok: false, code: "META_QUEUE_RECORD_NOT_FOUND" };
  if (record.status === "sent") return { ok: true, idempotent: true, code: "ALREADY_SENT" };
  if (record.status === "dead") return { ok: false, code: "META_QUEUE_DEAD" };

  const result = await sendMetaConversionPayload(record.payload);
  const attempts = Math.max(1, Number(record.attempts || 0) + (record.status === "processing" ? 0 : 1));

  // Rollout seguro: falta temporária de credencial/configuração não pode destruir um evento de receita.
  // Mantemos o payload na fila para nova tentativa depois da configuração da Vercel.
  if (result.skipped) {
    const configurationExpired = attempts >= 24;
    const update = {
      status: configurationExpired ? "dead" : "retry",
      attempts: Math.min(attempts, 99),
      processing_started_at: null,
      next_attempt_at: configurationExpired ? record.next_attempt_at : new Date(Date.now() + 60 * 60_000).toISOString(),
      last_error_code: cleanText(result.code, 160) || "META_CAPI_NOT_CONFIGURED",
    };
    if (configurationExpired) update.payload = redactPayload(record.payload);
    const { error } = await supabaseAdmin.from("meta_conversion_events").update(update).eq("id", record.id);
    if (error) throw error;
    return result;
  }

  if (result.ok) {
    const { error } = await supabaseAdmin.from("meta_conversion_events").update({
      status: "sent",
      attempts,
      sent_at: new Date().toISOString(),
      processing_started_at: null,
      last_error_code: null,
      payload: redactPayload(record.payload),
      meta_trace_id: result.traceId || null,
    }).eq("id", record.id);
    if (error) throw error;
    return result;
  }

  const shouldRetry = result.transient !== false && attempts < MAX_ATTEMPTS;
  const status = shouldRetry ? "retry" : "dead";
  const update = {
    status,
    attempts,
    processing_started_at: null,
    next_attempt_at: shouldRetry ? nextAttemptIso(attempts) : record.next_attempt_at,
    last_error_code: cleanText(result.code, 160) || "META_CAPI_FAILED",
  };
  if (!shouldRetry) update.payload = redactPayload(record.payload);
  const { error } = await supabaseAdmin.from("meta_conversion_events").update(update).eq("id", record.id);
  if (error) throw error;
  return result;
}

export async function queueAndDeliverMetaConversionEvent(input) {
  try {
    const queued = await enqueueMetaConversionEvent(input);
    if (!queued.record || queued.record.status === "sent") return { ok: true, idempotent: true, queued: queued.queued };
    const delivery = await deliverMetaConversionRecord(queued.record);
    return { ...delivery, queued: true };
  } catch (error) {
    if (!error?.trackingQueueUnavailable) throw error;
    // Fail-open apenas para compatibilidade de rollout. Não impede o evento principal da aplicação.
    const payload = buildMetaEventPayload(input);
    const delivery = await sendMetaConversionPayload(payload);
    return { ...delivery, queued: false, fallback: true };
  }
}

export async function processPendingMetaConversionEvents({ batchSize = 25 } = {}) {
  const limit = Math.max(1, Math.min(100, Number(batchSize) || 25));
  const { data, error } = await supabaseAdmin.rpc("claim_meta_conversion_events", { p_limit: limit });
  if (error) throw error;
  const records = data || [];
  const summary = { claimed: records.length, sent: 0, retried: 0, dead: 0, failed: 0 };

  for (const record of records) {
    try {
      const result = await deliverMetaConversionRecord(record);
      if (result.ok) summary.sent += 1;
      else {
        const refreshed = await loadQueueRecord(record.id);
        if (refreshed?.status === "retry") summary.retried += 1;
        else if (refreshed?.status === "dead") summary.dead += 1;
        else summary.failed += 1;
      }
    } catch (error) {
      summary.failed += 1;
      console.error("meta_capi_queue_delivery_failed", { id: record.id, code: error?.code || "unknown" });
    }
  }
  return summary;
}

export async function getClinicMarketingAttribution(clinicId) {
  if (!clinicId) return null;
  const { data, error } = await supabaseAdmin
    .from("saas_marketing_attribution")
    .select("*")
    .eq("clinica_id", clinicId)
    .maybeSingle();
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code)) return null;
    throw error;
  }
  return data;
}

export async function saveClinicMarketingAttribution({
  clinicId,
  email,
  phone,
  attribution,
  segment,
  registrationEventId,
} = {}) {
  if (!clinicId) return { ok: false, reason: "clinic_required" };
  const normalized = normalizeMarketingAttribution({ ...attribution, segment: segment || attribution?.segment });
  let lead = null;
  const normalizedEmail = cleanText(email, 320)?.toLowerCase() || null;
  const phoneCandidates = marketingPhoneCandidates(phone);

  const leadFields = "id, first_touch, last_touch, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbc, fbp, segmento_interesse, pagina, referrer";
  if (normalizedEmail) {
    const { data } = await supabaseAdmin.from("clinica_marketing_leads").select(leadFields).eq("email", normalizedEmail).order("created_at", { ascending: false }).limit(1);
    lead = data?.[0] || null;
  }
  if (!lead && phoneCandidates.length) {
    const { data } = await supabaseAdmin.from("clinica_marketing_leads").select(leadFields).in("whatsapp", phoneCandidates).order("created_at", { ascending: false }).limit(1);
    lead = data?.[0] || null;
  }

  // Se o usuário voltou em outro navegador, recuperamos a origem do lead já salvo em vez de perder a campanha.
  const leadAttribution = lead ? normalizeMarketingAttribution({
    first_touch: lead.first_touch,
    last_touch: lead.last_touch,
    utm_source: lead.utm_source,
    utm_medium: lead.utm_medium,
    utm_campaign: lead.utm_campaign,
    utm_content: lead.utm_content,
    utm_term: lead.utm_term,
    fbclid: lead.fbclid,
    fbc: lead.fbc,
    fbp: lead.fbp,
    segment: lead.segmento_interesse,
    first_page: lead.pagina,
    first_referrer: lead.referrer,
  }) : {};
  const effective = normalizeMarketingAttribution({ ...leadAttribution, ...normalized,
    first_touch: Object.keys(normalized.first_touch || {}).length ? normalized.first_touch : leadAttribution.first_touch,
    last_touch: Object.keys(normalized.last_touch || {}).length ? normalized.last_touch : leadAttribution.last_touch,
  });

  const row = {
    clinica_id: clinicId,
    marketing_lead_id: lead?.id || null,
    first_touch: effective.first_touch || {},
    last_touch: effective.last_touch || {},
    utm_source: effective.utm_source || null,
    utm_medium: effective.utm_medium || null,
    utm_campaign: effective.utm_campaign || null,
    utm_content: effective.utm_content || null,
    utm_term: effective.utm_term || null,
    fbclid: effective.fbclid || null,
    fbc: effective.fbc || null,
    fbp: effective.fbp || null,
    segmento_interesse: segment || effective.segment || lead?.segmento_interesse || null,
    landing_page: effective.first_page || effective.first_touch?.landing_page || lead?.pagina || null,
    referrer: effective.first_referrer || effective.first_touch?.referrer || lead?.referrer || null,
    registration_event_id: registrationEventId || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("saas_marketing_attribution").upsert(row, { onConflict: "clinica_id" });
  if (error) throw error;

  if (lead?.id) {
    await supabaseAdmin.from("clinica_marketing_leads").update({
      registered_clinica_id: clinicId,
      registered_at: new Date().toISOString(),
    }).eq("id", lead.id);
  }
  return { ok: true, leadId: lead?.id || null, attribution: effective };
}

export async function enqueueClinicLifecycleMetaEvent({
  clinicId,
  eventName,
  eventId,
  eventSourceUrl,
  eventTime = new Date(),
  value,
  currency,
  subscriptionId,
  segment,
  plan,
  sourceType = "saas_lifecycle",
  sourceId,
  clientIpAddress,
  clientUserAgent,
  contactEmail,
  contactPhone,
  fullName,
  externalId,
} = {}) {
  if (!clinicId) return { skipped: true, reason: "clinic_required" };
  const [{ data: clinic, error: clinicError }, attribution] = await Promise.all([
    supabaseAdmin.from("clinicas").select("id, nome, slug, email, telefone, billing_email, plano, metadata").eq("id", clinicId).maybeSingle(),
    getClinicMarketingAttribution(clinicId),
  ]);
  if (clinicError) throw clinicError;
  if (!clinic?.id) return { skipped: true, reason: "clinic_not_found" };

  // A demo compartilhada nunca deve alimentar o algoritmo de aquisição da Meta.
  if (clinic.slug === "demo-nexawi-clinicas" || String(clinic.email || "").toLowerCase() === "demo@nexawi.com.br" || clinic.metadata?.demo_account === true) {
    return { skipped: true, reason: "demo_clinic" };
  }

  const safeEventId = eventId || deterministicMetaEventId(eventName, sourceId || clinic.id);
  const userData = userDataFromAttribution({
    email: contactEmail || clinic.billing_email || clinic.email,
    phone: contactPhone || clinic.telefone,
    fullName: fullName || null,
    externalId: externalId || clinic.id,
    attribution,
    clientIpAddress,
    clientUserAgent,
  });

  const input = {
    eventName,
    eventId: safeEventId,
    eventTime,
    eventSourceUrl,
    userData,
    customData: {
      segment: segment || attribution?.segmento_interesse || attribution?.last_touch?.segment || attribution?.first_touch?.segment,
      plan: cleanText(plan || clinic.plano || clinic.metadata?.assinatura_solicitada_plano, 120),
      subscription_id: subscriptionId,
      value,
      currency,
      lead_source: attribution?.utm_source || null,
    },
    clinicId: clinic.id,
    marketingLeadId: attribution?.marketing_lead_id || null,
    sourceType,
    sourceId: sourceId || clinic.id,
  };
  try {
    const queued = await enqueueMetaConversionEvent(input);
    return { ...queued, input, attribution, clinic };
  } catch (error) {
    if (error?.trackingQueueUnavailable) {
      return { queued: false, record: null, input, attribution, clinic, queueUnavailable: true };
    }
    throw error;
  }
}

export function userDataFromAttribution({ email, phone, fullName, externalId, attribution, clientIpAddress, clientUserAgent } = {}) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return buildMetaUserData({
    email,
    phone,
    firstName: parts[0] || null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
    externalId,
    fbc: attribution?.fbc || attribution?.last_touch?.fbc || attribution?.first_touch?.fbc,
    fbp: attribution?.fbp || attribution?.last_touch?.fbp || attribution?.first_touch?.fbp,
    clientIpAddress,
    clientUserAgent,
  });
}
