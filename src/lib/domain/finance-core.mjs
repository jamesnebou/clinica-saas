export const NON_BILLABLE_APPOINTMENT_STATUSES = new Set(["cancelado", "cancelled", "faltou", "no_show"]);
export const CANCELLED_PAYMENT_STATUSES = new Set(["cancelado", "cancelled", "estornado", "refunded", "falhou", "failed"]);
export const PAID_PAYMENT_STATUSES = new Set(["pago", "paid", "confirmado", "confirmed", "received", "received_in_cash"]);

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

export function isCancelledAppointment(record) {
  return NON_BILLABLE_APPOINTMENT_STATUSES.has(normalized(record?.status));
}

export function isCancelledPayment(record) {
  return CANCELLED_PAYMENT_STATUSES.has(normalized(record?.pagamento_status || record?.payment_status || record?.status_pagamento));
}

export function isBillableRecord(record) {
  return Boolean(record) && !isCancelledAppointment(record) && !isCancelledPayment(record);
}

export function isPaidPayment(payment) {
  return PAID_PAYMENT_STATUSES.has(normalized(payment?.status || payment?.pagamento_status));
}

export function paidAmount(record) {
  if (!record || isCancelledPayment(record)) return 0;
  if (Array.isArray(record.pagamentos)) {
    return record.pagamentos
      .filter((payment) => isPaidPayment(payment) && !CANCELLED_PAYMENT_STATUSES.has(normalized(payment?.status)))
      .reduce((total, payment) => total + Number(payment?.valor_pago ?? payment?.valor ?? 0), 0);
  }
  const status = normalized(record.status || record.pagamento_status);
  if (record.agendamento_id == null && status && !PAID_PAYMENT_STATUSES.has(status)) return 0;
  return Number(record.valor_pago ?? record.paid_amount ?? 0);
}

export function expectedAmount(record) {
  if (!isBillableRecord(record)) return 0;
  return Number(record?.valor ?? record?.valor_final ?? record?.total ?? 0);
}

export function summarizeFinancialRecords(records = []) {
  return records.reduce((summary, record) => {
    const paid = paidAmount(record);
    const expected = expectedAmount(record);
    summary.received += paid;
    if (isBillableRecord(record)) {
      summary.expected += expected;
      summary.pending += Math.max(0, expected - paid);
    }
    return summary;
  }, { expected: 0, received: 0, pending: 0 });
}

