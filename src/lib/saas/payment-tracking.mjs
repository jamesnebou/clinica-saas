import { deterministicMetaEventId } from "../tracking/core.mjs";

const PURCHASE_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const PAID_STATUSES = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);
const FINAL_REFUND_EVENTS = new Set(["PAYMENT_REFUNDED", "PAYMENT_RECEIVED_IN_CASH_UNDONE"]);
const PARTIAL_REFUND_EVENTS = new Set(["PAYMENT_PARTIALLY_REFUNDED"]);
const PENDING_REFUND_EVENTS = new Set(["PAYMENT_REFUND_IN_PROGRESS"]);
const CHARGEBACK_EVENTS = new Set([
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
]);

function normalized(value) {
  return String(value || "").trim().toUpperCase();
}

export function isDemoSaasClinic(clinic) {
  const slug = String(clinic?.slug || "").trim().toLowerCase();
  const email = String(clinic?.email || "").trim().toLowerCase();
  return slug === "demo-nexawi-clinicas"
    || email === "demo@nexawi.com.br"
    || clinic?.metadata?.demo_account === true
    || clinic?.metadata?.demo === true;
}

export function normalizeAsaasPaymentStatus({ event, status } = {}) {
  const eventName = normalized(event);
  const paymentStatus = normalized(status);

  if (FINAL_REFUND_EVENTS.has(eventName) || paymentStatus === "REFUNDED") return "estornado";
  if (PARTIAL_REFUND_EVENTS.has(eventName) || paymentStatus === "PARTIALLY_REFUNDED") return "estornado_parcial";
  if (PENDING_REFUND_EVENTS.has(eventName) || paymentStatus === "REFUND_REQUESTED") return "estorno_pendente";
  if (CHARGEBACK_EVENTS.has(eventName) || ["CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"].includes(paymentStatus)) return "contestado";
  if (PURCHASE_EVENTS.has(eventName) && PAID_STATUSES.has(paymentStatus)) return "pago";
  if (eventName === "PAYMENT_REFUND_DENIED" && PAID_STATUSES.has(paymentStatus)) return "pago";
  if (eventName === "PAYMENT_OVERDUE" || paymentStatus === "OVERDUE") return "vencido";
  if (["PAYMENT_DELETED", "PAYMENT_BANK_SLIP_CANCELLED"].includes(eventName) || ["DELETED", "CANCELED"].includes(paymentStatus)) return "cancelado";
  return "pendente";
}

export function saasPaymentActivation({ clinic, payment, event } = {}) {
  const trustedFinancialSource = PURCHASE_EVENTS.has(normalized(event)) || normalized(event) === "SUBSCRIPTION_PAYMENT_SYNC";
  if (!trustedFinancialSource || !PAID_STATUSES.has(normalized(payment?.status))) {
    return { activate: false, reason: "payment_not_confirmed" };
  }
  if (!payment?.id || !payment?.subscription || payment.subscription !== clinic?.asaas_subscription_id) {
    return { activate: false, reason: "subscription_mismatch" };
  }
  if (["cancelada", "pausada"].includes(clinic?.assinatura_status) || ["cancelada", "inativa", "bloqueada"].includes(clinic?.status)) {
    return { activate: false, reason: "subscription_inactive" };
  }
  if (clinic?.asaas_customer_id && payment?.customer && clinic.asaas_customer_id !== payment.customer) {
    return { activate: false, reason: "customer_mismatch" };
  }
  if (payment?.externalReference && payment.externalReference !== clinic?.id) {
    return { activate: false, reason: "clinic_mismatch" };
  }

  const target = clinic?.metadata?.assinatura_solicitada_plano;
  const targetSubscription = clinic?.metadata?.assinatura_solicitada_subscription_id;
  const targetValue = Number(clinic?.metadata?.assinatura_solicitada_valor);
  if (target && targetSubscription === payment.subscription) {
    const actualValue = Number(payment.value);
    if (!Number.isFinite(actualValue) || !Number.isFinite(targetValue) || Math.abs(actualValue - targetValue) > 0.009) {
      return clinic?.status === "ativa" && clinic?.assinatura_status === "ativa"
        ? { activate: true, plan: clinic.plano, reason: "prior_plan_payment" }
        : { activate: false, reason: "amount_mismatch" };
    }
    return { activate: true, plan: target, reason: "target_plan_paid" };
  }
  return clinic?.status === "ativa" && clinic?.assinatura_status === "ativa"
    ? { activate: true, plan: clinic.plano, reason: "existing_paid_plan" }
    : { activate: false, reason: "pending_plan_missing" };
}

export function buildSaasPurchaseDecision({ event, payment, clinic } = {}) {
  const eventName = normalized(event);
  const paymentStatus = normalized(payment?.status);

  if (!PURCHASE_EVENTS.has(eventName)) return { shouldTrack: false, reason: "event_not_paid" };
  if (!PAID_STATUSES.has(paymentStatus)) return { shouldTrack: false, reason: "status_not_paid" };
  if (!payment?.id) return { shouldTrack: false, reason: "payment_id_required" };
  if (!payment?.subscription) return { shouldTrack: false, reason: "subscription_required" };
  if (!clinic?.asaas_subscription_id) return { shouldTrack: false, reason: "current_subscription_required" };
  if (payment.subscription !== clinic.asaas_subscription_id) return { shouldTrack: false, reason: "stale_subscription" };
  if (isDemoSaasClinic(clinic)) return { shouldTrack: false, reason: "demo_clinic" };
  if (clinic.asaas_customer_id && payment?.customer && clinic.asaas_customer_id !== payment.customer) {
    return { shouldTrack: false, reason: "customer_mismatch" };
  }
  if (clinic.id && payment?.externalReference && clinic.id !== payment.externalReference) {
    return { shouldTrack: false, reason: "external_reference_mismatch" };
  }

  const value = Number(payment.value);
  if (!Number.isFinite(value) || value <= 0) return { shouldTrack: false, reason: "invalid_paid_value" };

  return {
    shouldTrack: true,
    paymentId: payment.id,
    subscriptionId: payment.subscription,
    eventId: deterministicMetaEventId("purchase", payment.id),
    value: Math.round(value * 100) / 100,
    currency: "BRL",
    sourceType: "saas_payment",
  };
}
