import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decryptClinicSecrets } from "@/lib/security/clinic-secrets";
import { notifyPublicBookingPaymentConfirmedById } from "@/lib/notifications/booking";
import { emitDomainEvent } from "@/lib/whatsapp/events";
import {
  cancelCanonicalReceivableByOrigin,
  syncCanonicalAppointmentPayment,
  syncCanonicalOrderPayment,
} from "@/lib/finance/canonical";
import { closeDirectSaleOpportunityFromBooking } from "@/lib/crm/payments";
import { deterministicMetaEventId } from "@/lib/tracking/core.mjs";
import { deliverMetaConversionRecord, enqueueClinicLifecycleMetaEvent, queueAndDeliverMetaConversionEvent } from "@/lib/tracking/service";

export const runtime = "nodejs";


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

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function getWebhookToken(request) {
  return request.headers.get("asaas-access-token") || request.headers.get("x-webhook-token") || "";
}

async function isAllowedWebhookToken(request, token) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (expectedToken && token === expectedToken) return true;
  if (!token) return false;
  const clinicId = request.nextUrl.searchParams.get("clinica");
  let query = supabaseAdmin.from("clinica_integracoes")
    .select("clinica_id, asaas_segredos_criptografados, asaas_webhook_token")
    .eq("asaas_ativo", true);
  if (clinicId) query = query.eq("clinica_id", clinicId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).some((item) => (decryptClinicSecrets(item.asaas_segredos_criptografados).webhookToken || item.asaas_webhook_token) === token);
}

function normalizePaymentStatus(status) {
  const value = String(status || "").toUpperCase();

  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(value)) return "pago";
  if (["OVERDUE"].includes(value)) return "vencido";
  if (["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"].includes(value)) return "estornado";
  if (["DELETED", "CANCELED"].includes(value)) return "cancelado";
  return "pendente";
}

function isPaidBillingStatus(status) {
  return ["pago", "received", "confirmed", "received_in_cash"].includes(String(status || "").toLowerCase());
}

function commercialStatusFromPayment(status) {
  const normalized = normalizePaymentStatus(status);
  if (normalized === "pago") return { status: "ativa", assinatura_status: "ativa", bloqueada_em: null, bloqueio_motivo: null };
  if (normalized === "vencido") return { status: "inadimplente", assinatura_status: "atrasada", bloqueada_em: new Date().toISOString(), bloqueio_motivo: "Pagamento Asaas vencido." };
  return null;
}

function commercialStatusFromSubscription(event, subscription) {
  const eventName = String(event || "").toUpperCase();
  const status = String(subscription?.status || "").toUpperCase();

  if (eventName === "SUBSCRIPTION_DELETED" || subscription?.deleted === true) {
    return { status: "cancelada", assinatura_status: "cancelada", bloqueada_em: new Date().toISOString(), bloqueio_motivo: "Assinatura Asaas cancelada definitivamente." };
  }

  if (eventName === "SUBSCRIPTION_INACTIVATED" || status === "INACTIVE") {
    return { status: "inativa", assinatura_status: "pausada", bloqueada_em: new Date().toISOString(), bloqueio_motivo: "Cobrança recorrente pausada temporariamente." };
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
    const { data } = await supabaseAdmin.from("clinicas").select("id, asaas_subscription_id").eq("asaas_subscription_id", subscriptionId).maybeSingle();
    if (data?.id) return data;
  }

  if (externalReference) {
    const { data } = await supabaseAdmin.from("clinicas").select("id, asaas_subscription_id").eq("id", externalReference).maybeSingle();
    if (data?.id) return data;
  }

  if (customerId) {
    const { data } = await supabaseAdmin.from("clinicas").select("id, asaas_subscription_id").eq("asaas_customer_id", customerId).maybeSingle();
    if (data?.id) return data;
  }

  return null;
}

async function updatePublicBookingPayment({ payment, payload, event, paymentStatus, paidAt }) {
  const paymentId = payment?.id || "";
  const externalReference = payment?.externalReference || "";

  let query = supabaseAdmin
    .from("site_agendamentos_publicos")
    .select("id, clinica_id, cliente_id, profissional_id, procedimento_id, agendamento_id, crm_oportunidade_id, valor_total, valor_sinal, pagamento_status")
    .limit(1);

  if (paymentId) {
    query = query.eq("asaas_payment_id", paymentId);
  } else if (externalReference) {
    query = query.eq("agendamento_id", externalReference);
  } else {
    return false;
  }

  const { data, error } = await query;
  if (error) throw error;
  const booking = data?.[0];
  if (!booking?.id) return false;

  const publicStatus = paymentStatus === "pago" ? "pago" : paymentStatus === "cancelado" ? "cancelado" : "pendente";

  const { error: publicError } = await supabaseAdmin
    .from("site_agendamentos_publicos")
    .update({
      pagamento_status: publicStatus,
      pagamento_gateway: "asaas",
      pagamento_external_id: paymentId || externalReference || null,
      asaas_payment_id: paymentId || null,
      invoice_url: payment?.invoiceUrl || null,
      payload,
    })
    .eq("id", booking.id);

  if (publicError) throw publicError;

  if (booking.agendamento_id && paymentStatus === "pago") {
    const { error: agendaError } = await supabaseAdmin
      .from("agendamentos")
      .update({
        pagamento_status: "parcial",
        forma_pagamento: "outro",
        valor_pago: Number(booking.valor_sinal || payment?.value || 0),
        data_pagamento: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
        status: "confirmado",
      })
      .eq("id", booking.agendamento_id);

    if (agendaError) throw agendaError;
    await syncCanonicalAppointmentPayment({ clinicId: booking.clinica_id, appointmentId: booking.agendamento_id,
      value: Number(booking.valor_total || payment?.value || booking.valor_sinal || 0), paidValue: Number(booking.valor_sinal || payment?.value || 0),
      clientId: booking.cliente_id, professionalId: booking.profissional_id, procedureId: booking.procedimento_id,
      description: "Sinal de agendamento", provider: "asaas", providerReference: paymentId || externalReference,
      paidAt: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(), paymentMethod: String(payment?.billingType || "").toLowerCase(), metadata: { webhook: true } });
  } else if (booking.agendamento_id && ["cancelado", "estornado"].includes(paymentStatus)) {
    await cancelCanonicalReceivableByOrigin({
      clinicId: booking.clinica_id,
      originType: "agendamento",
      originId: booking.agendamento_id,
      reason: `Pagamento ${paymentStatus} pelo Asaas`,
    });
  }

  if (paymentStatus === "pago" && booking.pagamento_status !== "pago") {
    await notifyPublicBookingPaymentConfirmedById(booking.id).catch((notificationError) => {
      console.error("Erro ao enviar confirmação de pagamento do Asaas:", notificationError);
    });
    await emitDomainEvent({
      clinicId: booking.clinica_id,
      eventName: "payment.confirmed",
      aggregateId: booking.agendamento_id,
      payload: { source: "asaas", public_booking_id: booking.id },
      idempotencyKey: `payment.confirmed:${booking.agendamento_id}:asaas:${paymentId || event}`,
    }).catch((eventError) => {
      console.error("whatsapp_payment_confirmed_event_failed", { clinicId: booking.clinica_id, code: eventError?.code || "unknown" });
    });
    await closeDirectSaleOpportunityFromBooking(booking).catch((crmError) => {
      console.error("crm_direct_sale_close_failed", { clinicId: booking.clinica_id, code: crmError?.code || "unknown" });
    });
  }

  return true;
}

async function updateStoreOrderPayment({ payment, payload, paymentStatus, paidAt }) {
  const paymentId = payment?.id || "";
  const externalReference = String(payment?.externalReference || "");
  const externalOrderId = externalReference.startsWith("loja:") ? externalReference.slice(5) : "";
  if (!paymentId && !externalOrderId) return false;
  let order = null;
  if (paymentId) {
    const { data, error } = await supabaseAdmin.from("pedidos_clinica").select("id, clinica_id, cliente_id, total, pagamento_status, status").eq("asaas_payment_id", paymentId).limit(1);
    if (error) throw error; order = data?.[0] || null;
  }
  if (!order && externalOrderId) {
    const { data, error } = await supabaseAdmin.from("pedidos_clinica").select("id, clinica_id, cliente_id, total, pagamento_status, status").eq("id", externalOrderId).limit(1);
    if (error) throw error; order = data?.[0] || null;
  }
  if (!order?.id) return false;
  const invoiceUrl = payment?.invoiceUrl || payment?.bankSlipUrl || null;
  const { error: orderPayloadError } = await supabaseAdmin.from("pedidos_clinica").update({ pagamento_gateway: "asaas", pagamento_external_id: paymentId || externalReference || null, asaas_payment_id: paymentId || null, invoice_url: invoiceUrl, payload_pagamento: payload }).eq("id", order.id).eq("clinica_id", order.clinica_id);
  if (orderPayloadError) throw orderPayloadError;
  if (paymentStatus === "pago") {
    const { error } = await supabaseAdmin.rpc("confirmar_pagamento_pedido_loja", { p_pedido_id: order.id, p_asaas_payment_id: paymentId || null, p_payload: payload, p_pago_em: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString() }); if (error) throw error;
  } else if (paymentStatus === "estornado" && order.pagamento_status === "pago") {
    const { error } = await supabaseAdmin.rpc("estornar_pedido_loja", { p_pedido_id: order.id, p_motivo: "Estorno confirmado pelo webhook Asaas." }); if (error) throw error;
  } else if (["cancelado", "vencido"].includes(paymentStatus) && order.pagamento_status !== "pago") {
    const { error } = await supabaseAdmin.rpc("cancelar_pedido_loja", { p_pedido_id: order.id, p_motivo: `Pagamento ${paymentStatus} no Asaas.` }); if (error) throw error;
  }
  const billingType = String(payment?.billingType || "").toUpperCase();
  const forma = billingType === "PIX" ? "pix" : billingType === "BOLETO" ? "boleto" : billingType === "CREDIT_CARD" ? "cartao_credito" : "link";
  const internalStatus = paymentStatus === "pago" ? "pago" : paymentStatus === "estornado" ? "estornado" : paymentStatus === "cancelado" ? "cancelado" : paymentStatus === "vencido" ? "falhou" : "pendente";
  const { error: paymentError } = await supabaseAdmin.from("pagamentos_loja_clinica").upsert({ clinica_id: order.clinica_id, cliente_id: order.cliente_id, pedido_id: order.id, valor: Number(payment?.value || order.total || 0), forma, status: internalStatus, provedor: "asaas", provedor_pagamento_id: paymentId, link_pagamento: invoiceUrl, pago_em: paymentStatus === "pago" ? (paidAt ? new Date(paidAt).toISOString() : new Date().toISOString()) : null, vencimento_em: payment?.dueDate ? new Date(`${payment.dueDate}T23:59:59`).toISOString() : null, payload, observacoes: "Atualizado automaticamente pelo webhook da lojinha." }, { onConflict: "clinica_id,provedor,provedor_pagamento_id" });
  if (paymentError) throw paymentError;
  if (paymentStatus === "pago") await syncCanonicalOrderPayment({ clinicId: order.clinica_id, orderId: order.id,
    value: Number(order.total || payment?.value || 0), paidValue: Number(payment?.value || order.total || 0), clientId: order.cliente_id,
    description: `Pedido ${order.id}`, provider: "asaas", providerReference: paymentId || externalReference,
    paidAt: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(), paymentMethod: forma, metadata: { webhook: true } });
  else if (["cancelado", "estornado"].includes(paymentStatus)) await cancelCanonicalReceivableByOrigin({
    clinicId: order.clinica_id,
    originType: "ecommerce",
    originId: order.id,
    reason: `Pedido ${paymentStatus} pelo Asaas`,
  });
  return true;
}

async function findClinicBySubscription(subscription) {
  const subscriptionId = subscription?.id || "";
  const customerId = subscription?.customer || "";
  const externalReference = subscription?.externalReference || "";

  if (subscriptionId) {
    const { data } = await supabaseAdmin.from("clinicas").select("id, asaas_subscription_id, assinatura_status, metadata").eq("asaas_subscription_id", subscriptionId).maybeSingle();
    if (data?.id) return data;
  }

  if (externalReference) {
    const { data } = await supabaseAdmin.from("clinicas").select("id, asaas_subscription_id, assinatura_status, metadata").eq("id", externalReference).maybeSingle();
    if (data?.id) return data;
  }

  if (customerId) {
    const { data } = await supabaseAdmin.from("clinicas").select("id, asaas_subscription_id, assinatura_status, metadata").eq("asaas_customer_id", customerId).maybeSingle();
    if (data?.id) return data;
  }

  return null;
}

export async function POST(request) {
  if (!(await isAllowedWebhookToken(request, getWebhookToken(request)))) {
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

    if (clinic.asaas_subscription_id && subscription?.id && clinic.asaas_subscription_id !== subscription.id) {
      return NextResponse.json({ ok: true, matched: true, ignored: true, reason: "stale_subscription", type: "subscription" });
    }

    if (!clinic.asaas_subscription_id && clinic.assinatura_status === "cancelada" && clinic.metadata?.last_asaas_subscription_id === subscription?.id && String(event).toUpperCase() !== "SUBSCRIPTION_DELETED") {
      return NextResponse.json({ ok: true, matched: true, ignored: true, reason: "canceled_subscription", type: "subscription" });
    }

    const commercialStatus = commercialStatusFromSubscription(event, subscription);
    const subscriptionDeleted = String(event).toUpperCase() === "SUBSCRIPTION_DELETED" || subscription?.deleted === true;
    const { error } = await supabaseAdmin
      .from("clinicas")
      .update({
        ...(commercialStatus || {}),
        asaas_subscription_id: subscriptionDeleted ? null : subscription?.id || clinic.asaas_subscription_id || null,
        ...(subscription?.customer ? { asaas_customer_id: subscription.customer } : {}),
        proxima_cobranca_em: subscriptionDeleted ? null : subscription?.nextDueDate || null,
      })
      .eq("id", clinic.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, matched: true, type: "subscription" });
  }

  const payment = payload?.payment || payload?.data || payload;
  const paymentStatus = normalizePaymentStatus(payment?.status);
  const paidAt = payment?.paymentDate || payment?.confirmedDate || payment?.clientPaymentDate || null;

  const storeOrderUpdated = await updateStoreOrderPayment({ payment, payload, event, paymentStatus, paidAt });
  if (storeOrderUpdated) return NextResponse.json({ ok: true, matched: true, type: "store-order-payment" });

  const publicBookingUpdated = await updatePublicBookingPayment({ payment, payload, event, paymentStatus, paidAt });
  if (publicBookingUpdated) {
    return NextResponse.json({ ok: true, matched: true, type: "public-booking-payment" });
  }

  const clinic = await findClinicByPayment(payment);

  if (!clinic?.id) {
    return NextResponse.json({ ok: true, matched: false, type: "payment" });
  }

  let previousCharge = null;
  if (payment?.id) {
    const { data } = await supabaseAdmin
      .from("asaas_cobrancas")
      .select("status, pago_em")
      .eq("asaas_payment_id", payment.id)
      .maybeSingle();
    previousCharge = data || null;
  }
  const preservePaidCharge = isPaidBillingStatus(previousCharge?.status) && !["pago", "estornado"].includes(paymentStatus);
  const effectivePaymentStatus = preservePaidCharge ? previousCharge.status : paymentStatus;
  const effectivePaidAt = preservePaidCharge ? previousCharge.pago_em : paidAt ? new Date(paidAt).toISOString() : null;

  const { error: billingError } = await supabaseAdmin.from("asaas_cobrancas").upsert({
    clinica_id: clinic.id,
    asaas_payment_id: payment?.id || null,
    asaas_subscription_id: payment?.subscription || null,
    evento: event || null,
    status: effectivePaymentStatus,
    valor: Number(payment?.value || payment?.netValue || 0),
    vencimento: payment?.dueDate || null,
    pago_em: effectivePaidAt,
    invoice_url: payment?.invoiceUrl || null,
    bank_slip_url: payment?.bankSlipUrl || null,
    payload,
  }, { onConflict: "asaas_payment_id" });

  if (billingError) {
    return NextResponse.json({ ok: false, error: billingError.message }, { status: 500 });
  }

  const commercialStatus = commercialStatusFromPayment(payment?.status);
  if (commercialStatus && payment?.subscription && payment.subscription === clinic.asaas_subscription_id) {
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


  // Purchase Meta representa somente receita do SaaS NexaWi. Pedidos da lojinha e sinais de pacientes
  // retornam antes deste bloco e nunca alimentam o Dataset de aquisição da plataforma.
  if (paymentStatus === "pago" && payment?.id && payment?.subscription) {
    const { data: subscriptionClinic } = await supabaseAdmin
      .from("clinicas")
      .select("id, asaas_subscription_id")
      .eq("id", clinic.id)
      .maybeSingle();

    if (subscriptionClinic?.asaas_subscription_id && subscriptionClinic.asaas_subscription_id === payment.subscription) {
      try {
        const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://clinicas.nexawi.com.br";
        const tracking = await enqueueClinicLifecycleMetaEvent({
          clinicId: clinic.id,
          eventName: "Purchase",
          eventId: deterministicMetaEventId("purchase", payment.id),
          eventTime: paidAt ? new Date(paidAt) : new Date(),
          eventSourceUrl: new URL("/dashboard/assinatura", baseUrl).toString(),
          value: Number(payment?.value || payment?.netValue || 0),
          currency: "BRL",
          subscriptionId: payment.subscription,
          sourceType: "saas_payment",
          sourceId: payment.id,
          externalId: clinic.id,
        });
        scheduleTrackingDelivery(tracking, "meta_capi_purchase_delivery_failed");
      } catch (trackingError) {
        console.error("marketing_purchase_tracking_failed", { code: trackingError?.code || "unknown" });
      }
    }
  }

  return NextResponse.json({ ok: true, matched: true, type: "payment" });
}
