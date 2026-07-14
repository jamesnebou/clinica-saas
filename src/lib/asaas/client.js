const ASAAS_BASE_URLS = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};

export function getAsaasBaseUrl(environment = "sandbox") {
  return environment === "producao" ? ASAAS_BASE_URLS.producao : ASAAS_BASE_URLS.sandbox;
}

function getAsaasConfig(config = {}) {
  const apiKey = config.apiKey || config.asaas_api_key || process.env.ASAAS_API_KEY;
  const requestedBaseUrl = config.baseUrl || config.asaas_base_url || process.env.ASAAS_BASE_URL;
  const environment = String(config.ambiente || config.environment || "sandbox").toLowerCase();
  const baseUrl = String(requestedBaseUrl || getAsaasBaseUrl(environment)).replace(/\/$/, "");

  return { apiKey, baseUrl };
}

export function isAsaasConfigured(config = {}) {
  return Boolean(config?.asaas_ativo && (config.apiKey || config.asaas_api_key)) || Boolean(!config?.clinica_id && process.env.ASAAS_API_KEY);
}

async function asaasRequest(path, options = {}, config = {}) {
  const { apiKey, baseUrl } = getAsaasConfig(config);

  if (!apiKey) {
    throw new Error("ASAAS_API_KEY nao configurada.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": process.env.ASAAS_USER_AGENT || "NexaWi-Clinicas/1.0",
      access_token: apiKey,
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.errors?.[0]?.description || payload?.message || "Erro ao comunicar com o Asaas.";
    throw new Error(message);
  }

  return payload;
}

export async function validateAsaasConnection(integration) {
  await asaasRequest("/webhooks?limit=1&offset=0", { method: "GET" }, integration);
  return { ok: true };
}

export async function upsertAsaasWebhook({ integration, webhookUrl, authToken, email }) {
  const name = "NexaWi Clínicas - Pedidos";
  const events = [
    "PAYMENT_CREATED",
    "PAYMENT_UPDATED",
    "PAYMENT_CONFIRMED",
    "PAYMENT_RECEIVED",
    "PAYMENT_OVERDUE",
    "PAYMENT_DELETED",
    "PAYMENT_REFUNDED",
    "PAYMENT_CHARGEBACK_REQUESTED",
    "PAYMENT_CHARGEBACK_DISPUTE",
  ];
  const list = await asaasRequest("/webhooks?limit=100&offset=0", { method: "GET" }, integration);
  const existing = (list?.data || []).find((item) => item?.url === webhookUrl || item?.name === name);
  const payload = {
    name,
    url: webhookUrl,
    email,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken,
    sendType: "SEQUENTIALLY",
    events,
  };

  if (existing?.id) {
    const updatePayload = {
      name: payload.name,
      url: payload.url,
      enabled: payload.enabled,
      interrupted: payload.interrupted,
      authToken: payload.authToken,
      sendType: payload.sendType,
      events: payload.events,
    };
    return asaasRequest(`/webhooks/${existing.id}`, { method: "PUT", body: JSON.stringify(updatePayload) }, integration);
  }

  return asaasRequest("/webhooks", { method: "POST", body: JSON.stringify(payload) }, integration);
}

export async function removeAsaasWebhook(webhookId, integration) {
  if (!webhookId) return null;
  return asaasRequest(`/webhooks/${webhookId}`, { method: "DELETE" }, integration);
}

export async function createAsaasCustomerForClinic(clinic) {
  return asaasRequest("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: clinic.nome,
      email: clinic.billing_email || clinic.email || undefined,
      phone: clinic.telefone || undefined,
      mobilePhone: clinic.telefone || undefined,
      cpfCnpj: clinic.documento || undefined,
      externalReference: clinic.id,
      notificationDisabled: false,
    }),
  });
}

export async function createAsaasSubscriptionForClinic({ clinic, plan, customerId, billingType = "UNDEFINED" }) {
  const nextDueDate = new Date();
  nextDueDate.setDate(nextDueDate.getDate() + 1);

  return asaasRequest("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType,
      value: Number(plan.preco_mensal || 0),
      nextDueDate: nextDueDate.toISOString().slice(0, 10),
      cycle: "MONTHLY",
      description: `Assinatura ${plan.nome} - NexaWi Clínicas`,
      externalReference: clinic.id,
    }),
  });
}

export async function listAsaasSubscriptionPayments(subscriptionId) {
  if (!subscriptionId) return [];
  const payload = await asaasRequest(`/subscriptions/${subscriptionId}/payments`, { method: "GET" });
  return payload?.data || [];
}

export async function createAsaasCustomerForPatient({ clinicId, nome, email, telefone, cpf, integration }) {
  return asaasRequest("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: nome,
      email: email || undefined,
      phone: telefone || undefined,
      mobilePhone: telefone || undefined,
      cpfCnpj: cpf || undefined,
      externalReference: `site-booking:${clinicId}:${email || telefone || nome}`,
      notificationDisabled: false,
    }),
  }, integration);
}

export async function createAsaasPaymentForBooking({ customerId, value, description, externalReference, billingType = "UNDEFINED", integration }) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1);

  return asaasRequest("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType,
      value: Number(value || 0),
      dueDate: dueDate.toISOString().slice(0, 10),
      description,
      externalReference,
    }),
  }, integration);
}

export async function createAsaasPaymentForOrder({ customerId, value, description, externalReference, billingType = "UNDEFINED", callbackUrl, integration }) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1);

  return asaasRequest("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType,
      value: Number(value || 0),
      dueDate: dueDate.toISOString().slice(0, 10),
      description,
      externalReference,
      ...(callbackUrl ? { callback: { successUrl: callbackUrl, autoRedirect: true } } : {}),
    }),
  }, integration);
}

export async function createAsaasCheckoutForOrder({
  value,
  description,
  externalReference,
  billingTypes,
  minutesToExpire,
  callback,
  customerData,
  integration,
}) {
  return asaasRequest("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      billingTypes,
      chargeTypes: ["DETACHED"],
      minutesToExpire: Math.max(10, Math.min(1440, Number(minutesToExpire || 30))),
      externalReference,
      callback,
      items: [{
        externalReference,
        name: description,
        description,
        quantity: 1,
        value: Number(value || 0),
      }],
      customerData: {
        name: customerData?.name,
        cpfCnpj: customerData?.cpfCnpj || undefined,
        email: customerData?.email || undefined,
        phone: customerData?.phone || undefined,
      },
    }),
  }, integration);
}

export async function refundAsaasPayment(paymentId, integration) {
  if (!paymentId) throw new Error("Pagamento Asaas não informado.");
  return asaasRequest(`/payments/${paymentId}/refund`, { method: "POST" }, integration);
}
