"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { normalizeSelectedPlan, normalizeSignupPhone } from "@/lib/auth/self-service.mjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SEGMENT_OPTIONS } from "@/lib/segments/registry";
import { deterministicMetaEventId, isValidMetaEventId, normalizeMarketingAttribution } from "@/lib/tracking/core.mjs";
import { deliverMetaConversionRecord, enqueueClinicLifecycleMetaEvent, queueAndDeliverMetaConversionEvent, saveClinicMarketingAttribution } from "@/lib/tracking/service";
import { getTrustedAppOrigin } from "@/lib/security/app-origin";

function text(formData, key) {
  return String(formData.get(key) || "").trim();
}


async function trackingRequestContext(pathname) {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    eventSourceUrl: new URL(pathname, await getTrustedAppOrigin()).toString(),
    clientIpAddress: forwarded || headerStore.get("x-real-ip") || null,
    clientUserAgent: headerStore.get("user-agent") || null,
  };
}

function scheduleTrackingDelivery(result, logCode) {
  if (!result?.record?.id && !result?.input) return;
  after(async () => {
    try {
      if (result.record?.id) await deliverMetaConversionRecord(result.record);
      else if (result.input) await queueAndDeliverMetaConversionEvent(result.input);
    } catch (error) {
      console.error(logCode, { code: error?.code || "unknown" });
    }
  });
}

function parseMarketingAttribution(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return normalizeMarketingAttribution(parsed);
  } catch {
    return {};
  }
}

function hasMarketingAttribution(value) {
  return Boolean(value && typeof value === "object" && Object.keys(value).length);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function createClinicAction(_prevState, formData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login-cliente");
  }

  const nome = text(formData, "nome");
  const email = text(formData, "email") || user.email;
  const selectedPlan = normalizeSelectedPlan(formData.get("selected_plan") || user.user_metadata?.selected_plan);
  const contactPhone = normalizeSignupPhone(text(formData, "telefone") || user.user_metadata?.phone) || null;
  const validSegments = new Set(SEGMENT_OPTIONS.map((item) => item.slug));
  const primarySegment = validSegments.has(text(formData, "segmento_principal")) ? text(formData, "segmento_principal") : "estetica";
  const additionalSegments = [...new Set(formData.getAll("segmentos_adicionais").map(String).filter((slug) => validSegments.has(slug) && slug !== primarySegment))];

  if (!nome) {
    return { ok: false, message: "Informe o nome da clínica." };
  }

  const baseSlug = slugify(text(formData, "slug") || nome);
  const slug = baseSlug || `clinica-${Date.now()}`;

  const { data: existing } = await supabaseAdmin
    .from("clinicas")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing?.id) {
    return { ok: false, message: "Este identificador já está em uso. Escolha outro." };
  }

  const { data: clinica, error: clinicaError } = await supabaseAdmin
    .from("clinicas")
    .insert({
      nome,
      slug,
      email,
      telefone: contactPhone,
      cidade: text(formData, "cidade") || null,
      estado: text(formData, "estado") || null,
      documento: text(formData, "documento") || null,
      status: "trial",
      plano: "starter",
      assinatura_status: "trial",
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      billing_email: email,
      metadata: {
        selected_plan_intent: selectedPlan,
        signup_source: user.user_metadata?.signup_source || "onboarding",
      },
    })
    .select("id")
    .single();

  if (clinicaError) {
    return { ok: false, message: clinicaError.message || "Erro ao criar clínica." };
  }

  const { error: membershipError } = await supabaseAdmin
    .from("usuarios_clinica")
    .insert({
      clinica_id: clinica.id,
      user_id: user.id,
      nome: user.user_metadata?.name || user.email || "Administrador",
      email: user.email,
      papel: "owner",
      ativo: true,
      accepted_at: new Date().toISOString(),
    });

  if (membershipError) {
    await supabaseAdmin.from("clinicas").delete().eq("id", clinica.id);
    return { ok: false, message: membershipError.message || "Clínica criada, mas não foi possível vincular usuário." };
  }

  const selectedSlugs = [primarySegment, ...additionalSegments];
  const { data: segmentRows, error: segmentQueryError } = await supabaseAdmin
    .from("segmentos")
    .select("id, slug")
    .in("slug", selectedSlugs);

  if (!segmentQueryError && segmentRows?.length) {
    const { error: segmentInsertError } = await supabaseAdmin.from("clinica_segmentos").insert(
      segmentRows.map((segment) => ({ clinica_id: clinica.id, segmento_id: segment.id, principal: segment.slug === primarySegment })),
    );
    if (segmentInsertError) {
      await supabaseAdmin.from("clinicas").delete().eq("id", clinica.id);
      return { ok: false, message: "Não foi possível salvar os segmentos da clínica." };
    }
  }


  // Persistimos a origem comercial antes do redirect. Falha de tracking nunca desfaz a criação da clínica.
  try {
    const formAttribution = parseMarketingAttribution(formData.get("marketing_attribution"));
    const attribution = hasMarketingAttribution(formAttribution)
      ? formAttribution
      : normalizeMarketingAttribution(user.user_metadata?.marketing_attribution || {});
    const requestedEventId = String(formData.get("meta_registration_event_id") || "").trim();
    const registrationEventId = isValidMetaEventId(requestedEventId)
      ? requestedEventId
      : deterministicMetaEventId("complete_registration", clinica.id);
    const contactEmail = email || user.email || null;
    const savedAttribution = await saveClinicMarketingAttribution({
      clinicId: clinica.id,
      email: contactEmail,
      phone: contactPhone,
      attribution,
      segment: primarySegment,
      registrationEventId,
    });
    const requestContext = await trackingRequestContext("/onboarding");
    const tracking = await enqueueClinicLifecycleMetaEvent({
      clinicId: clinica.id,
      eventName: "CompleteRegistration",
      eventId: registrationEventId,
      eventSourceUrl: requestContext.eventSourceUrl,
      segment: primarySegment,
      sourceType: "clinic_registration",
      sourceId: clinica.id,
      clientIpAddress: requestContext.clientIpAddress,
      clientUserAgent: requestContext.clientUserAgent,
      contactEmail,
      contactPhone,
      fullName: user.user_metadata?.name || null,
      externalId: user.id,
    });
    scheduleTrackingDelivery(tracking, "meta_capi_registration_delivery_failed");

    if (savedAttribution?.leadId) {
      await supabaseAdmin.from("clinica_marketing_eventos").insert({
        event_name: "registration_complete",
        lead_id: savedAttribution.leadId,
        pagina: "/onboarding",
        utm_source: savedAttribution.attribution?.utm_source || null,
        utm_medium: savedAttribution.attribution?.utm_medium || null,
        utm_campaign: savedAttribution.attribution?.utm_campaign || null,
        utm_content: savedAttribution.attribution?.utm_content || null,
        utm_term: savedAttribution.attribution?.utm_term || null,
        metadata: { clinica_id: clinica.id, segment: primarySegment, meta_event_id: registrationEventId },
      });
    }
  } catch (trackingError) {
    console.error("marketing_registration_tracking_failed", { code: trackingError?.code || "unknown" });
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
