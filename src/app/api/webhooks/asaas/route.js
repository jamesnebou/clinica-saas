import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function getWebhookToken(request) {
  return request.headers.get("asaas-access-token") || request.headers.get("x-webhook-token") || "";
}

function normalizePaymentStatus(status) {
  const value = String(status || "").toUpperCase();

  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(value)) return "pago";
  if (["OVERDUE"].includes(value)) return "vencido";
  if (["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"].includes(value)) return "estornado";
  if (["DELETED", "CANCELED"].includes(value)) return "cancelado";
  return "pendente";
}

function commercialStatusFromPayment(status) {
  const normalized = normalizePaymentStatus(status);
  if (normalized === "pago") return { status: "ativa", assinatura_status: "ativa", bloqueada_em: null, bloqueio_motivo: null };
  if (normalized === "vencido") return { status: "inadimplente", assinatura_status: "atrasada", bloqueada_em: new Date().toISOString(), bloqueio_motivo: "Pagamento Asaas vencido." };
  if (normalized === "cancelado") return { status: "cancelada", assinatura_status: "cancelada", bloqueada_em: new Date().toISOString(), bloqueio_motivo: "Cobranca/assinatura Asaas cancelada." };
  return null;
}

function commercialStatusFromSubscription(event, subscription) {
  const eventName = String(event || "").toUpperCase();
  const status = String(subscription?.status || "").toUpperCase();

  if (eventName === "SUBSCRIPTION_DELETED" || eventName === "SUBSCRIPTION_INACTIVATED" || subscription?.deleted === true || status === "INACTIVE") {
    return { status: "cancelada", assinatura_status: "cancelada", bloqueada_em: new Date().toISOString(), bloqueio_motivo: "Assinatura Asaas inativada ou removida." };
  }

  if (eventName === "SUBSCRIPTION_CREATED" || eventName === "SUBSCRIPTION_UPDATED" || status === "ACTIVE") {
    return { status: "ativa", assinatura_status: "ativa", bloqueada_em: null, bloqueio_motivo: null };
  }

  return null;
}

async function findClinicByPayment(payment) {
  const subscriptionId = payment?.subscription || "";
  const customerId = payment?.customer || "";
  const externalReference = payment?.externalReference || "";

  if (subscriptionId) {
    const { data } = await supabaseAdmin.from("clinicas").select("id").eq("asaas_subscription_id", subscriptionId).maybeSingle();
    if (data?.id) return data;
  }

  if (externalReference) {
    const { data } = await supabaseAdmin.from("clinicas").select("id").eq("id", externalReference).maybeSingle();
    if (data?.id) return data;
  }

  if (customerId) {
    const { data } = await supabaseAdmin.from("clinicas").select("id").eq("asaas_customer_id", customerId).maybeSingle();
    if (data?.id) return data;
  }

  return null;
}

async function findClinicBySubscription(subscription) {
  const subscriptionId = subscription?.id || "";
  const customerId = subscription?.customer || "";
  const externalReference = subscription?.externalReference || "";

  if (subscriptionId) {
    const { data } = await supabaseAdmin.from("clinicas").select("id").eq("asaas_subscription_id", subscriptionId).maybeSingle();
    if (data?.id) return data;
  }

  if (externalReference) {
    const { data } = await supabaseAdmin.from("clinicas").select("id").eq("id", externalReference).maybeSingle();
    if (data?.id) return data;
  }

  if (customerId) {
    const { data } = await supabaseAdmin.from("clinicas").select("id").eq("asaas_customer_id", customerId).maybeSingle();
    if (data?.id) return data;
  }

  return null;
}

export async function POST(request) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;

  if (expectedToken && getWebhookToken(request) !== expectedToken) {
    return unauthorized();
  }

  const payload = await request.json();
  const event = payload?.event || "";
  const subscription = payload?.subscription || null;

  if (subscription?.id || String(event).startsWith("SUBSCRIPTION_")) {
    const clinic = await findClinicBySubscription(subscription);

    if (!clinic?.id) {
      return NextResponse.json({ ok: true, matched: false, type: "subscription" });
    }

    const commercialStatus = commercialStatusFromSubscription(event, subscription);
    const { error } = await supabaseAdmin
      .from("clinicas")
      .update({
        ...(commercialStatus || {}),
        asaas_subscription_id: subscription?.id || null,
        asaas_customer_id: subscription?.customer || null,
        proxima_cobranca_em: subscription?.nextDueDate || null,
      })
      .eq("id", clinic.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, matched: true, type: "subscription" });
  }

  const payment = payload?.payment || payload?.data || payload;
  const clinic = await findClinicByPayment(payment);

  if (!clinic?.id) {
    return NextResponse.json({ ok: true, matched: false, type: "payment" });
  }

  const paymentStatus = normalizePaymentStatus(payment?.status);
  const paidAt = payment?.paymentDate || payment?.confirmedDate || payment?.clientPaymentDate || null;

  const { error: billingError } = await supabaseAdmin.from("asaas_cobrancas").upsert({
    clinica_id: clinic.id,
    asaas_payment_id: payment?.id || null,
    asaas_subscription_id: payment?.subscription || null,
    evento: event || null,
    status: paymentStatus,
    valor: Number(payment?.value || payment?.netValue || 0),
    vencimento: payment?.dueDate || null,
    pago_em: paidAt ? new Date(paidAt).toISOString() : null,
    invoice_url: payment?.invoiceUrl || null,
    bank_slip_url: payment?.bankSlipUrl || null,
    payload,
  }, { onConflict: "asaas_payment_id" });

  if (billingError) {
    return NextResponse.json({ ok: false, error: billingError.message }, { status: 500 });
  }

  const commercialStatus = commercialStatusFromPayment(payment?.status);
  if (commercialStatus) {
    const { error: clinicError } = await supabaseAdmin
      .from("clinicas")
      .update({
        ...commercialStatus,
        proxima_cobranca_em: payment?.dueDate || null,
      })
      .eq("id", clinic.id);

    if (clinicError) {
      return NextResponse.json({ ok: false, error: clinicError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, matched: true, type: "payment" });
}
