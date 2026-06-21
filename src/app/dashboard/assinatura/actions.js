"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClinic } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAsaasCustomerForClinic, createAsaasSubscriptionForClinic, isAsaasConfigured, listAsaasSubscriptionPayments } from "@/lib/asaas/client";
import { getSystemPlans } from "@/lib/saas/plans";

function text(formData, key) {
  return String(formData.get(key) || "").trim();
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function redirectSubscriptionError(error, fallback = "upgrade") {
  const params = new URLSearchParams({ erro: fallback, mensagem: error?.message || "Nao foi possível processar a assinatura agora." });
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
    throw new Error("Seu usuario nao tem permissao para alterar a assinatura da clinica.");
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

  const planSlug = requireValue(text(formData, "plano"), "Plano nao informado.");
  const billingEmail = text(formData, "billing_email") || activeClinic.billing_email || activeClinic.email;
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

  const billingEmail = requireValue(text(formData, "billing_email"), "Informe o e-mail de cobranca.");

  const { error } = await supabaseAdmin
    .from("clinicas")
    .update({ billing_email: billingEmail })
    .eq("id", activeClinic.id);

  if (error) redirectSubscriptionError(error, "email");
  revalidatePath("/dashboard/assinatura");
  redirect("/dashboard/assinatura?ok=email");
}


