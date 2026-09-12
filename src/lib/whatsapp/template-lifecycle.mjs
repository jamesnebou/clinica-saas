import { nextRetryAt } from "./core.mjs";

const TEMPLATE_REVIEW_DELAY_MS = 60 * 60 * 1000;

const DEFERRED_TEMPLATE_MESSAGES = Object.freeze({
  PENDING: "Template Meta aguardando aprovação.",
  IN_APPEAL: "Template Meta aguardando resultado do recurso.",
  PAUSED: "Template Meta pausado temporariamente.",
});

const PERMANENT_TEMPLATE_MESSAGES = Object.freeze({
  REJECTED: "Template Meta rejeitado; requer correção.",
  DISABLED: "Template Meta desabilitado; requer correção.",
  PENDING_DELETION: "Template Meta em processo de exclusão; requer substituição.",
  DELETED: "Template Meta excluído; requer substituição.",
  LIMIT_EXCEEDED: "Limite de templates Meta excedido; requer correção.",
});

export function classifyTemplateLifecycle(template) {
  if (!template) {
    return {
      action: "dead",
      status: "MISSING",
      message: "Template Meta não configurado para este gatilho.",
    };
  }

  const status = String(template.status || "").trim().toUpperCase();
  if (status === "APPROVED") return { action: "send", status, message: null };
  if (DEFERRED_TEMPLATE_MESSAGES[status]) {
    return { action: "defer", status, message: DEFERRED_TEMPLATE_MESSAGES[status] };
  }
  if (PERMANENT_TEMPLATE_MESSAGES[status]) {
    return { action: "dead", status, message: PERMANENT_TEMPLATE_MESSAGES[status] };
  }
  return {
    action: "dead",
    status: status || "UNKNOWN",
    message: "Status Meta do template não suportado; requer verificação.",
  };
}

export function deferredTemplateJobUpdate(job, now = Date.now()) {
  const claimedAttemptCount = Math.max(0, Number(job?.attempt_count) || 0);
  const regularRetryAt = new Date(nextRetryAt(claimedAttemptCount, now)).getTime();
  const reviewAt = Math.max(now + TEMPLATE_REVIEW_DELAY_MS, regularRetryAt);

  return {
    status: "retry",
    scheduled_at: new Date(reviewAt).toISOString(),
    attempt_count: Math.max(0, claimedAttemptCount - 1),
    locked_at: null,
    locked_by: null,
  };
}

export function notificationCancellationReason({ purpose, bookingStatus, paymentStatus }) {
  if (
    ["appointment_reminder_24h", "appointment_reminder_3h"].includes(purpose)
    && ["cancelado", "faltou", "concluido"].includes(String(bookingStatus || "").toLowerCase())
  ) {
    return "booking_inactive";
  }
  if (
    ["booking_payment_pending", "payment_expiring", "payment_expired"].includes(purpose)
    && paymentStatus !== "pendente"
  ) {
    return "payment_not_pending";
  }
  return null;
}
