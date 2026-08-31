"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { requireClinic } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAsaasCustomerForClinic, createAsaasSubscriptionForClinic, isAsaasConfigured, listAsaasSubscriptionPayments } from "@/lib/asaas/client";
import { getSystemPlans } from "@/lib/saas/plans";
import { deterministicMetaEventId } from "@/lib/tracking/core.mjs";
import { deliverMetaConversionRecord, enqueueClinicLifecycleMetaEvent, queueAndDeliverMetaConversionEvent } from "@/lib/tracking/service";


async function trackingRequestContext(pathname) {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  const baseUrl = host ? `${protocol}://${host}` : process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    eventSourceUrl: new URL(pathname, baseUrl).toString(),
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

function text(formData, key) {
  return String(formData.get(key) || "").trim();
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function redirectSubscriptionError(error, fallback = "upgrade") {
  const params = new URLSearchParams({ erro: fallback, mensagem: error?.message || "Não foi possível processar a assinatura agora." });
  redirect(`/dashboard/assinatura?${params.toString()}`);
}

function nextBillingDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function ensureCanManageSubscription(memberships, activeClinic) {
  const membership = memberships.find((item) => item.clinica_id === activeClinic.id) || memberships[0];
  const allowed = ["owner", "admin", "financeiro"];

  if (!allowed.includes(membership?.papel)) {
    throw new Error("Seu usuário não tem permissão para alterar a assinatura da clínica.");
  }
}

async function getFullClinic(clinicaId) {
  const { data, error } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, documento, telefone, email, cidade, estado, status, plano, metadata, trial_ends_at, billing_email, asaas_customer_id, asaas_subscription_id, assinatura_status, proxima_cobranca_em, bloqueada_em, bloqueio_motivo")
    .eq("id", clinicaId)
    .single();

  if (error) throw error;
  return data;
}

export async function startSubscriptionAction(formData) {
  const { activeClinic, memberships } = await requireClinic();

  try {
    ensureCanManageSubscription(memberships, activeClinic);
  } catch (error) {
    redirectSubscriptionError(error, "permissao");
  }

  const planSlug = requireValue(text(formData, "plano"), "Plano não informado.");
  const billingEmail = text(formData, "billing_email") || activeClinic.billing_email || activeClinic.email;
  const billingType = text(formData, "billing_type") || "UNDEFINED";
  const plans = await getSystemPlans();
  const plan = plans.find((item) => item.slug === planSlug);

  if (!plan) {
    redirect("/dashboard/assinatura?erro=plano");
  }

  let clinic;
  try {
    clinic = await getFullClinic(activeClinic.id);
  } catch (error) {
    redirectSubscriptionError(error, "clinica");
  }

  if (!isAsaasConfigured()) {
    const { error } = await supabaseAdmin
      .from("clinicas")
      .update({
        plano: plan.slug,
        billing_email: billingEmail || null,
        metadata: {
          ...(clinic.metadata || {}),
          assinatura_solicitada_em: new Date().toISOString(),
          assinatura_solicitada_plano: plan.slug,
          assinatura_solicitada_status: "aguardando_configuracao_asaas",
        },
      })
      .eq("id", clinic.id);

    if (error) redirectSubscriptionError(error, "upgrade");

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/assinatura");
    redirect("/dashboard/assinatura?erro=asaas");
  }

  let customerId = clinic.asaas_customer_id;
  let subscription;
  let firstPayment = null;

  try {
    if (!customerId) {
      const customer = await createAsaasCustomerForClinic({ ...clinic, billing_email: billingEmail });
      customerId = customer.id;
    }

    subscription = await createAsaasSubscriptionForClinic({
      clinic: { ...clinic, billing_email: billingEmail },
      plan,
      customerId,
      billingType,
    });

    const payments = await listAsaasSubscriptionPayments(subscription.id);
    firstPayment = payments?.[0] || null;
  } catch (error) {
    redirectSubscriptionError(error, "asaas_api");
  }

  const { error } = await supabaseAdmin
    .from("clinicas")
    .update({
      plano: plan.slug,
      billing_email: billingEmail || null,
      asaas_customer_id: customerId,
      asaas_subscription_id: subscription.id,
      status: "ativa",
      assinatura_status: "ativa",
      proxima_cobranca_em: subscription.nextDueDate || nextBillingDate(),
      bloqueada_em: null,
      bloqueio_motivo: null,
      metadata: {
        ...(clinic.metadata || {}),
        assinatura_ativada_em: new Date().toISOString(),
        asaas_subscription_status: subscription.status || null,
        asaas_billing_type: billingType,
      },
    })
    .eq("id", clinic.id);

  if (error) redirectSubscriptionError(error, "upgrade");

  if (firstPayment?.id) {
    await supabaseAdmin.from("asaas_cobrancas").upsert({
      clinica_id: clinic.id,
      asaas_payment_id: firstPayment.id,
      asaas_subscription_id: subscription.id,
      evento: "SUBSCRIPTION_FIRST_PAYMENT",
      status: String(firstPayment.status || "pendente").toLowerCase(),
      valor: Number(firstPayment.value || firstPayment.netValue || plan.preco_mensal || 0),
      vencimento: firstPayment.dueDate || subscription.nextDueDate || null,
      pago_em: firstPayment.paymentDate ? new Date(firstPayment.paymentDate).toISOString() : null,
      invoice_url: firstPayment.invoiceUrl || null,
      bank_slip_url: firstPayment.bankSlipUrl || null,
      payload: firstPayment,
    }, { onConflict: "asaas_payment_id" });
  }


  try {
    const requestContext = await trackingRequestContext("/dashboard/assinatura");
    const tracking = await enqueueClinicLifecycleMetaEvent({
      clinicId: clinic.id,
      eventName: "Subscribe",
      eventId: deterministicMetaEventId("subscribe", subscription.id),
      eventSourceUrl: requestContext.eventSourceUrl,
      value: Number(plan.preco_mensal || 0),
      currency: "BRL",
      subscriptionId: subscription.id,
      plan: plan.slug,
      sourceType: "saas_subscription",
      sourceId: subscription.id,
      clientIpAddress: requestContext.clientIpAddress,
      clientUserAgent: requestContext.clientUserAgent,
      contactEmail: billingEmail || clinic.billing_email || clinic.email,
      contactPhone: clinic.telefone,
      externalId: clinic.id,
    });
    scheduleTrackingDelivery(tracking, "meta_capi_subscribe_delivery_failed");
  } catch (trackingError) {
    console.error("marketing_subscription_tracking_failed", { code: trackingError?.code || "unknown" });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assinatura");
  redirect("/dashboard/assinatura?ok=assinatura");
}

export async function updateBillingEmailAction(formData) {
  const { activeClinic, memberships } = await requireClinic();

  try {
    ensureCanManageSubscription(memberships, activeClinic);
  } catch (error) {
    redirectSubscriptionError(error, "permissao");
  }

  const billingEmail = requireValue(text(formData, "billing_email"), "Informe o e-mail de cobrança.");

  const { error } = await supabaseAdmin
    .from("clinicas")
    .update({ billing_email: billingEmail })
    .eq("id", activeClinic.id);

  if (error) redirectSubscriptionError(error, "email");
  revalidatePath("/dashboard/assinatura");
  redirect("/dashboard/assinatura?ok=email");
}


