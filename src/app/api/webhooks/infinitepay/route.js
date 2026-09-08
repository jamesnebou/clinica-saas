import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkInfinitePayPayment } from "@/lib/infinitepay/client";
import { notifyPublicBookingPaymentConfirmedById } from "@/lib/notifications/booking";
import { emitDomainEvent } from "@/lib/whatsapp/events";
import { syncCanonicalAppointmentPayment, syncCanonicalOrderPayment } from "@/lib/finance/canonical";
import { closeDirectSaleOpportunityFromBooking } from "@/lib/crm/payments";

export const runtime = "nodejs";

function webhookValue(payload, snakeCase, camelCase) {
  return payload?.[snakeCase] ?? payload?.[camelCase] ?? "";
}

function paymentReference(payload) {
  return String(webhookValue(payload, "order_nsu", "orderNsu") || "");
}

function referenceParts(reference) {
  const separator = reference.indexOf(":");
  if (separator < 1) return { type: "", id: "" };
  return {
    type: reference.slice(0, separator),
    id: reference.slice(separator + 1),
  };
}

function amountInCents(value) {
  return Math.round(Number(value || 0) * 100);
}

async function loadIntegration(clinicId) {
  const { data, error } = await supabaseAdmin
    .from("clinica_integracoes")
    .select("infinitepay_handle")
    .eq("clinica_id", clinicId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function verifyPayment({ payload, clinicId, expectedCents }) {
  const integration = await loadIntegration(clinicId);
  const orderNsu = paymentReference(payload);
  const transactionNsu = String(webhookValue(payload, "transaction_nsu", "transactionNsu") || "");
  const invoiceSlug = String(webhookValue(payload, "invoice_slug", "invoiceSlug") || "");

  if (!integration?.infinitepay_handle || !orderNsu || !transactionNsu || !invoiceSlug) {
    throw new Error("Pagamento InfinitePay sem dados suficientes para verificação.");
  }

  const verification = await checkInfinitePayPayment({
    handle: integration.infinitepay_handle,
    orderNsu,
    transactionNsu,
    slug: invoiceSlug,
  });

  if (verification?.success === false) {
    throw new Error("A InfinitePay não confirmou a autenticidade do pagamento.");
  }

  const verifiedAmount = Number(verification?.amount ?? payload?.amount ?? 0);
  if (!Number.isFinite(verifiedAmount) || Math.round(verifiedAmount) !== expectedCents) {
    throw new Error("O valor confirmado pela InfinitePay não corresponde ao pedido.");
  }

  return {
    paid: verification?.paid === true,
    verification,
    orderNsu,
    transactionNsu,
    invoiceSlug,
    receiptUrl: String(webhookValue(payload, "receipt_url", "receiptUrl") || ""),
  };
}

async function updateBooking({ id, payload }) {
  const { data: booking, error } = await supabaseAdmin
    .from("site_agendamentos_publicos")
    .select("id, clinica_id, cliente_id, profissional_id, procedimento_id, agendamento_id, crm_oportunidade_id, valor_total, valor_sinal, pagamento_status, payload")
    .eq("agendamento_id", id)
    .maybeSingle();
  if (error) throw error;
  if (!booking) return false;

  const verified = await verifyPayment({
    payload,
    clinicId: booking.clinica_id,
    expectedCents: amountInCents(booking.valor_sinal),
  });
  if (!verified.paid || booking.pagamento_status === "pago") return true;

  const paidAt = new Date().toISOString();
  const storedPayload = {
    ...(booking.payload || {}),
    pagamento_gateway: "infinitepay",
    infinitepay_webhook: payload,
    infinitepay_verificacao: verified.verification,
  };

  await syncCanonicalAppointmentPayment({ clinicId: booking.clinica_id, appointmentId: booking.agendamento_id,
    value: Number(booking.valor_total || booking.valor_sinal || 0), paidValue: Number(booking.valor_sinal || 0),
    clientId: booking.cliente_id, professionalId: booking.profissional_id, procedureId: booking.procedimento_id, description: "Sinal de agendamento",
    provider: "infinitepay", providerReference: verified.transactionNsu || verified.orderNsu, paidAt, paymentMethod: "infinitepay", metadata: { webhook: true } });
  const { error: bookingError } = await supabaseAdmin
    .from("site_agendamentos_publicos")
    .update({
      pagamento_status: "pago",
      pagamento_gateway: "infinitepay",
      pagamento_external_id: verified.orderNsu,
      pagamento_transaction_id: verified.transactionNsu,
      pagamento_receipt_url: verified.receiptUrl || null,
      payload: storedPayload,
    })
    .eq("id", booking.id);
  if (bookingError) throw bookingError;
  await notifyPublicBookingPaymentConfirmedById(booking.id).catch((notificationError) => {
    console.error("Erro ao enviar confirmação de pagamento da InfinitePay:", notificationError);
  });
  await emitDomainEvent({
    clinicId: booking.clinica_id,
    eventName: "payment.confirmed",
    aggregateId: booking.agendamento_id,
    payload: { source: "infinitepay", public_booking_id: booking.id },
    idempotencyKey: `payment.confirmed:${booking.agendamento_id}:infinitepay:${verified.transactionNsu}`,
  }).catch((eventError) => {
    console.error("whatsapp_payment_confirmed_event_failed", { clinicId: booking.clinica_id, code: eventError?.code || "unknown" });
  });
  await closeDirectSaleOpportunityFromBooking(booking).catch((crmError) => {
    console.error("crm_direct_sale_close_failed", { clinicId: booking.clinica_id, code: crmError?.code || "unknown" });
  });
  return true;
}

async function updateStoreOrder({ id, payload }) {
  const { data: order, error } = await supabaseAdmin
    .from("pedidos_clinica")
    .select("id, clinica_id, cliente_id, total, pagamento_status, payload_pagamento")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return false;

  const verified = await verifyPayment({
    payload,
    clinicId: order.clinica_id,
    expectedCents: amountInCents(order.total),
  });
  if (!verified.paid || order.pagamento_status === "pago") return true;

  const paidAt = new Date().toISOString();
  const storedPayload = {
    ...(order.payload_pagamento || {}),
    infinitepay_webhook: payload,
    infinitepay_verificacao: verified.verification,
  };

  const { error: updateError } = await supabaseAdmin.from("pedidos_clinica").update({
    pagamento_gateway: "infinitepay",
    pagamento_external_id: verified.orderNsu,
    pagamento_transaction_id: verified.transactionNsu,
    pagamento_receipt_url: verified.receiptUrl || null,
    payload_pagamento: storedPayload,
  }).eq("id", order.id).eq("clinica_id", order.clinica_id);
  if (updateError) throw updateError;

  const captureMethod = String(verified.verification?.capture_method || payload?.capture_method || "").toUpperCase();
  await syncCanonicalOrderPayment({ clinicId: order.clinica_id, orderId: order.id, value: Number(order.total || 0),
    paidValue: Number(order.total || 0), clientId: order.cliente_id, description: `Pedido ${order.id}`, provider: "infinitepay",
    providerReference: verified.transactionNsu || verified.orderNsu, paidAt, paymentMethod: captureMethod.includes("PIX") ? "pix" : "cartao_credito", metadata: { webhook: true, payload: storedPayload } });
  return true;
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const reference = referenceParts(paymentReference(payload));
    if (!reference.id) return NextResponse.json({ ok: true, matched: false });

    const matched = reference.type === "agendamento"
      ? await updateBooking({ id: reference.id, payload })
      : reference.type === "loja"
        ? await updateStoreOrder({ id: reference.id, payload })
        : false;

    return NextResponse.json({ ok: true, matched });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Falha ao validar o pagamento InfinitePay." },
      { status: 400 },
    );
  }
}
