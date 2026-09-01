const REUSABLE_SUBSCRIPTION_STATUSES = new Set(["ACTIVE", "INACTIVE"]);
const PAID_CHARGE_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "PAGO", "PAID"]);

export function normalizeAsaasSubscriptionStatus(subscription) {
  if (subscription?.deleted === true) return "DELETED";
  return String(subscription?.status || "").trim().toUpperCase();
}

export function isReusableAsaasSubscription(subscription) {
  return Boolean(subscription?.id) && REUSABLE_SUBSCRIPTION_STATUSES.has(normalizeAsaasSubscriptionStatus(subscription));
}

function subscriptionTimestamp(subscription) {
  const raw = subscription?.dateCreated || subscription?.nextDueDate || "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function selectReusableAsaasSubscription({ localSubscriptionId, subscriptions = [] }) {
  const reusable = Array.from(new Map(
    subscriptions
      .filter(isReusableAsaasSubscription)
      .map((subscription) => [subscription.id, subscription]),
  ).values());

  reusable.sort((left, right) => {
    if (left.id === localSubscriptionId) return -1;
    if (right.id === localSubscriptionId) return 1;

    const leftStatus = normalizeAsaasSubscriptionStatus(left);
    const rightStatus = normalizeAsaasSubscriptionStatus(right);
    if (leftStatus === "ACTIVE" && rightStatus !== "ACTIVE") return -1;
    if (rightStatus === "ACTIVE" && leftStatus !== "ACTIVE") return 1;
    return subscriptionTimestamp(right) - subscriptionTimestamp(left);
  });

  return {
    subscription: reusable[0] || null,
    duplicates: reusable.slice(1),
  };
}

export function nextSubscriptionDueDate(now = new Date()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function decideSubscriptionMutation({ subscription, currentPlanSlug, targetPlanSlug, billingType }) {
  if (!isReusableAsaasSubscription(subscription)) {
    return { type: "create", createsSubscription: true, tracksSubscribe: true };
  }

  const status = normalizeAsaasSubscriptionStatus(subscription);
  if (status === "INACTIVE") {
    return { type: "reactivate", createsSubscription: false, tracksSubscribe: false };
  }

  const planChanged = String(currentPlanSlug || "").toLowerCase() !== String(targetPlanSlug || "").toLowerCase();
  const billingChanged = billingType && String(subscription.billingType || "").toUpperCase() !== String(billingType).toUpperCase();
  if (planChanged || billingChanged) {
    return { type: "update", createsSubscription: false, tracksSubscribe: false };
  }

  return { type: "synchronize", createsSubscription: false, tracksSubscribe: false };
}

export function buildSubscriptionUpdatePayload({ plan, billingType, status, nextDueDate }) {
  return {
    value: Number(plan?.preco_mensal || 0),
    description: `Assinatura ${plan?.nome || plan?.slug || "NexaWi"} - NexaWi Clínicas`,
    billingType: billingType || "UNDEFINED",
    cycle: "MONTHLY",
    updatePendingPayments: false,
    ...(status ? { status } : {}),
    ...(nextDueDate ? { nextDueDate } : {}),
  };
}

export function isPaidAsaasCharge(charge) {
  return PAID_CHARGE_STATUSES.has(String(charge?.status || "").trim().toUpperCase());
}

export function filterOperationalCharges(charges = [], currentSubscriptionId) {
  return charges.filter((charge) => {
    if (isPaidAsaasCharge(charge)) return true;
    if (!currentSubscriptionId) return !charge?.asaas_subscription_id;
    return !charge?.asaas_subscription_id || charge.asaas_subscription_id === currentSubscriptionId;
  });
}
