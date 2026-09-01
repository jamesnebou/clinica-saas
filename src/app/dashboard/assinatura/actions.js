"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { requireClinic } from "@/lib/auth/session";
import { isDemoClinic, isDemoLoginEmail } from "@/lib/demo/demo-account";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  createAsaasCustomerForClinic,
  createAsaasSubscriptionForClinic,
  getAsaasSubscription,
  isAsaasConfigured,
  isAsaasNotFoundError,
  listAsaasSubscriptions,
  listAsaasSubscriptionPayments,
  pauseAsaasSubscription,
  reactivateAsaasSubscription,
  removeAsaasSubscription,
  updateAsaasSubscription,
} from "@/lib/asaas/client";
import {
  buildSubscriptionUpdatePayload,
  decideSubscriptionMutation,
  isPaidAsaasCharge,
  nextSubscriptionDueDate,
  normalizeAsaasSubscriptionStatus,
  selectReusableAsaasSubscription,
} from "@/lib/saas/subscription-lifecycle.mjs";
import { getSystemPlans } from "@/lib/saas/plans";
import { deterministicMetaEventId } from "@/lib/tracking/core.mjs";
import { deliverMetaConversionRecord, enqueueClinicLifecycleMetaEvent, queueAndDeliverMetaConversionEvent } from "@/lib/tracking/service";

const OPERATION_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function operationKey(formData) {
  const value = text(formData, "operation_key");
  return OPERATION_KEY_PATTERN.test(value) ? value : randomUUID();
}

function safeErrorMessage(error) {
  if (error?.code === "SUBSCRIPTION_OPERATION_BUSY") return "Já existe uma alteração de assinatura em processamento. Aguarde alguns segundos e atualize a página.";
  if (error?.code === "SUBSCRIPTION_MIGRATION_REQUIRED") return "A migration de segurança das assinaturas ainda não foi aplicada.";
  if (error?.code === "ASAAS_DUPLICATE_SUBSCRIPTIONS") return "Foram encontradas múltiplas assinaturas reutilizáveis no Asaas. Faça a conciliação antes de alterar a recorrência.";
  if (error?.code === "ASAAS_SUBSCRIPTION_NOT_FOUND") return "Nenhuma assinatura reutilizável foi encontrada no Asaas.";
  if (error?.code === "DEMO_SUBSCRIPTION_FORBIDDEN") return "A demonstração não pode criar ou alterar cobranças reais.";
  return error?.message || "Não foi possível processar a assinatura agora.";
}

function redirectSubscriptionError(error, fallback = "upgrade") {
  const params = new URLSearchParams({ erro: fallback, mensagem: safeErrorMessage(error) });
  redirect(`/dashboard/assinatura?${params.toString()}`);
}

function ensureCanManageSubscription(memberships, activeClinic) {
  const membership = memberships.find((item) => item.clinica_id === activeClinic.id) || memberships[0];
  const allowed = ["owner", "admin", "financeiro"];

  if (!allowed.includes(membership?.papel)) {
    throw new Error("Seu usuário não tem permissão para alterar a assinatura da clínica.");
  }
}

function ensureRealClinic(user, clinic) {
  if (isDemoLoginEmail(user?.email) || isDemoClinic(clinic) || clinic?.assinatura_status === "isenta") {
    const error = new Error("A demonstração não pode alterar assinaturas.");
    error.code = "DEMO_SUBSCRIPTION_FORBIDDEN";
    throw error;
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

async function claimSubscriptionOperation({ clinicId, formData, operationType, targetPlan }) {
  const { data, error } = await supabaseAdmin.rpc("claim_saas_subscription_operation", {
    p_clinica_id: clinicId,
    p_operation_key: operationKey(formData),
    p_operation_type: operationType,
    p_target_plan: targetPlan || null,
  });

  if (error) {
    if (["42P01", "42883", "PGRST202"].includes(error.code)) {
      const migrationError = new Error("Migration de assinaturas pendente.");
      migrationError.code = "SUBSCRIPTION_MIGRATION_REQUIRED";
      throw migrationError;
    }
    throw error;
  }

  if (!data) {
    const busyError = new Error("Operação de assinatura em andamento.");
    busyError.code = "SUBSCRIPTION_OPERATION_BUSY";
    throw busyError;
  }

  return data;
}

async function finishSubscriptionOperation(operationId, { status, subscriptionId, errorCode, metadata = {} }) {
  if (!operationId) return;
  const { error } = await supabaseAdmin
    .from("saas_subscription_operations")
    .update({
      status,
      subscription_id: subscriptionId || null,
      error_code: errorCode || null,
      metadata,
      completed_at: new Date().toISOString(),
    })
    .eq("id", operationId);
  if (error) console.error("saas_subscription_operation_finalize_failed", { code: error.code || "unknown" });
}

async function findReusableSubscription(clinic) {
  const subscriptions = [];
  if (clinic.asaas_subscription_id) {
    try {
      const local = await getAsaasSubscription(clinic.asaas_subscription_id);
      if (local?.id) subscriptions.push(local);
    } catch (error) {
      if (!isAsaasNotFoundError(error)) throw error;
    }
  }

  subscriptions.push(...await listAsaasSubscriptions({ externalReference: clinic.id }));
  if (clinic.asaas_customer_id) {
    const byCustomer = await listAsaasSubscriptions({ customerId: clinic.asaas_customer_id });
    subscriptions.push(...byCustomer.filter((item) => item.id === clinic.asaas_subscription_id || item.externalReference === clinic.id));
  }

  const result = selectReusableAsaasSubscription({ localSubscriptionId: clinic.asaas_subscription_id, subscriptions });
  if (result.duplicates.length) {
    console.error("asaas_duplicate_subscriptions_detected", {
      clinicId: clinic.id,
      selected: result.subscription?.id || null,
      duplicates: result.duplicates.map((item) => item.id),
    });
    const error = new Error("Múltiplas assinaturas Asaas encontradas.");
    error.code = "ASAAS_DUPLICATE_SUBSCRIPTIONS";
    error.subscriptionId = result.subscription?.id || null;
    throw error;
  }

  return result.subscription;
}

async function syncSubscriptionPayments({ clinic, subscription, plan }) {
  const payments = await listAsaasSubscriptionPayments(subscription.id);
  for (const payment of payments || []) {
    if (!payment?.id) continue;
    const { data: previousCharge } = await supabaseAdmin
      .from("asaas_cobrancas")
      .select("status, pago_em")
      .eq("asaas_payment_id", payment.id)
      .maybeSingle();
    const incomingStatus = String(payment.status || "pendente").toLowerCase();
    const reversalStatus = ["refunded", "refund_requested", "chargeback_requested", "chargeback_dispute"].includes(incomingStatus);
    const preservePaidCharge = isPaidAsaasCharge(previousCharge) && !isPaidAsaasCharge(payment) && !reversalStatus;
    const { error } = await supabaseAdmin.from("asaas_cobrancas").upsert({
      clinica_id: clinic.id,
      asaas_payment_id: payment.id,
      asaas_subscription_id: subscription.id,
      evento: "SUBSCRIPTION_PAYMENT_SYNC",
      status: preservePaidCharge ? previousCharge.status : incomingStatus,
      valor: Number(payment.value || payment.netValue || plan.preco_mensal || 0),
      vencimento: payment.dueDate || subscription.nextDueDate || null,
      pago_em: preservePaidCharge ? previousCharge.pago_em : payment.paymentDate ? new Date(payment.paymentDate).toISOString() : null,
      invoice_url: payment.invoiceUrl || null,
      bank_slip_url: payment.bankSlipUrl || null,
      payload: payment,
    }, { onConflict: "asaas_payment_id" });
    if (error) throw error;
  }
}

export async function startSubscriptionAction(formData) {
  const { activeClinic, memberships, user } = await requireClinic();

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
    ensureRealClinic(user, clinic);
  } catch (error) {
    redirectSubscriptionError(error, "clinica");
  }

  if (!isAsaasConfigured()) {
    const { error } = await supabaseAdmin
      .from("clinicas")
      .update({
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

  const localStatus = String(clinic.assinatura_status || "").toLowerCase();
  const operationType = localStatus === "pausada"
    ? "reactivate"
    : clinic.asaas_subscription_id && clinic.plano !== plan.slug ? "change_plan" : "activate";
  let operationId;
  try {
    operationId = await claimSubscriptionOperation({ clinicId: clinic.id, formData, operationType, targetPlan: plan.slug });
  } catch (error) {
    redirectSubscriptionError(error, "operacao");
  }

  let subscription;
  let createdSubscription = false;
  let mutationType = "synchronize";

  try {
    clinic = await getFullClinic(clinic.id);
    subscription = await findReusableSubscription(clinic);
    const mutation = decideSubscriptionMutation({
      subscription,
      currentPlanSlug: clinic.plano,
      targetPlanSlug: plan.slug,
      billingType,
    });
    mutationType = mutation.type;

    if (mutation.type === "create") {
      let customerId = clinic.asaas_customer_id;
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
      createdSubscription = true;
    } else if (mutation.type === "reactivate") {
      subscription = await reactivateAsaasSubscription(
        subscription.id,
        nextSubscriptionDueDate(),
        buildSubscriptionUpdatePayload({ plan, billingType }),
      );
    } else if (mutation.type === "update") {
      subscription = await updateAsaasSubscription(
        subscription.id,
        buildSubscriptionUpdatePayload({ plan, billingType }),
      );
    }

    const { error: clinicError } = await supabaseAdmin.from("clinicas").update({
      plano: plan.slug,
      billing_email: billingEmail || null,
      asaas_customer_id: subscription.customer || clinic.asaas_customer_id || null,
      asaas_subscription_id: subscription.id,
      status: "ativa",
      assinatura_status: "ativa",
      proxima_cobranca_em: subscription.nextDueDate || nextSubscriptionDueDate(),
      bloqueada_em: null,
      bloqueio_motivo: null,
      metadata: {
        ...(clinic.metadata || {}),
        assinatura_ativada_em: createdSubscription ? new Date().toISOString() : clinic.metadata?.assinatura_ativada_em,
        assinatura_sincronizada_em: new Date().toISOString(),
        asaas_subscription_status: normalizeAsaasSubscriptionStatus(subscription),
        asaas_billing_type: subscription.billingType || billingType,
        asaas_subscription_operation: mutationType,
      },
    }).eq("id", clinic.id);
    if (clinicError) throw clinicError;

    await syncSubscriptionPayments({ clinic, subscription, plan });
    await finishSubscriptionOperation(operationId, {
      status: "succeeded",
      subscriptionId: subscription.id,
      metadata: { mutation_type: mutationType, created_subscription: createdSubscription, plan: plan.slug },
    });
  } catch (error) {
    await finishSubscriptionOperation(operationId, {
      status: "failed",
      subscriptionId: subscription?.id || error?.subscriptionId || null,
      errorCode: error?.code || "SUBSCRIPTION_OPERATION_FAILED",
      metadata: { mutation_type: mutationType, plan: plan.slug },
    });
    redirectSubscriptionError(error, error?.code === "ASAAS_DUPLICATE_SUBSCRIPTIONS" ? "duplicadas" : "asaas_api");
  }


  if (createdSubscription) {
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
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assinatura");
  redirect(`/dashboard/assinatura?ok=${createdSubscription ? "assinatura" : mutationType}`);
}

export async function pauseSubscriptionAction(formData) {
  const { activeClinic, memberships, user } = await requireClinic();
  let clinic;
  try {
    ensureCanManageSubscription(memberships, activeClinic);
    clinic = await getFullClinic(activeClinic.id);
    ensureRealClinic(user, clinic);
  } catch (error) {
    redirectSubscriptionError(error, "permissao");
  }

  let operationId;
  let subscription;
  try {
    operationId = await claimSubscriptionOperation({ clinicId: clinic.id, formData, operationType: "pause", targetPlan: clinic.plano });
    subscription = await findReusableSubscription(clinic);
    if (!subscription) {
      const notFound = new Error("Assinatura Asaas não encontrada.");
      notFound.code = "ASAAS_SUBSCRIPTION_NOT_FOUND";
      throw notFound;
    }
    if (normalizeAsaasSubscriptionStatus(subscription) === "ACTIVE") {
      subscription = await pauseAsaasSubscription(subscription.id);
    }

    const { error } = await supabaseAdmin.from("clinicas").update({
      asaas_subscription_id: subscription.id,
      asaas_customer_id: subscription.customer || clinic.asaas_customer_id,
      status: "inativa",
      assinatura_status: "pausada",
      proxima_cobranca_em: subscription.nextDueDate || clinic.proxima_cobranca_em,
      bloqueada_em: new Date().toISOString(),
      bloqueio_motivo: "Cobrança recorrente pausada temporariamente.",
      metadata: {
        ...(clinic.metadata || {}),
        assinatura_pausada_em: new Date().toISOString(),
        asaas_subscription_status: "INACTIVE",
      },
    }).eq("id", clinic.id);
    if (error) throw error;
    await finishSubscriptionOperation(operationId, { status: "succeeded", subscriptionId: subscription.id, metadata: { mutation_type: "pause" } });
  } catch (error) {
    await finishSubscriptionOperation(operationId, { status: "failed", subscriptionId: subscription?.id || error?.subscriptionId, errorCode: error?.code || "PAUSE_FAILED" });
    redirectSubscriptionError(error, error?.code === "ASAAS_DUPLICATE_SUBSCRIPTIONS" ? "duplicadas" : "asaas_api");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assinatura");
  redirect("/dashboard/assinatura?ok=pausada");
}

export async function cancelSubscriptionAction(formData) {
  const { activeClinic, memberships, user } = await requireClinic();
  if (text(formData, "confirmar_cancelamento") !== "on") {
    redirectSubscriptionError(new Error("Confirme que deseja cancelar definitivamente a recorrência."), "confirmacao");
  }

  let clinic;
  try {
    ensureCanManageSubscription(memberships, activeClinic);
    clinic = await getFullClinic(activeClinic.id);
    ensureRealClinic(user, clinic);
  } catch (error) {
    redirectSubscriptionError(error, "permissao");
  }

  let operationId;
  let subscription;
  try {
    operationId = await claimSubscriptionOperation({ clinicId: clinic.id, formData, operationType: "cancel", targetPlan: clinic.plano });
    subscription = await findReusableSubscription(clinic);
    const removedSubscriptionId = subscription?.id || clinic.asaas_subscription_id || null;
    if (subscription?.id) await removeAsaasSubscription(subscription.id);

    const { error } = await supabaseAdmin.from("clinicas").update({
      asaas_subscription_id: null,
      status: "cancelada",
      assinatura_status: "cancelada",
      proxima_cobranca_em: null,
      bloqueada_em: new Date().toISOString(),
      bloqueio_motivo: "Assinatura SaaS cancelada definitivamente.",
      metadata: {
        ...(clinic.metadata || {}),
        assinatura_cancelada_em: new Date().toISOString(),
        last_asaas_subscription_id: removedSubscriptionId,
        asaas_subscription_status: "DELETED",
      },
    }).eq("id", clinic.id);
    if (error) throw error;
    await finishSubscriptionOperation(operationId, { status: "succeeded", subscriptionId: removedSubscriptionId, metadata: { mutation_type: "cancel" } });
  } catch (error) {
    await finishSubscriptionOperation(operationId, { status: "failed", subscriptionId: subscription?.id || error?.subscriptionId, errorCode: error?.code || "CANCEL_FAILED" });
    redirectSubscriptionError(error, error?.code === "ASAAS_DUPLICATE_SUBSCRIPTIONS" ? "duplicadas" : "asaas_api");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/assinatura");
  redirect("/dashboard/assinatura?ok=cancelada");
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


