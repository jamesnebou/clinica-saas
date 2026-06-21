function getAsaasConfig() {
  const apiKey = process.env.ASAAS_API_KEY;
  const baseUrl = String(process.env.ASAAS_BASE_URL || "https://sandbox.asaas.com/api/v3").replace(/\/$/, "");

  return { apiKey, baseUrl };
}

export function isAsaasConfigured() {
  return Boolean(process.env.ASAAS_API_KEY);
}

async function asaasRequest(path, options = {}) {
  const { apiKey, baseUrl } = getAsaasConfig();

  if (!apiKey) {
    throw new Error("ASAAS_API_KEY nao configurada.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
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

export async function createAsaasSubscriptionForClinic({ clinic, plan, customerId }) {
  const nextDueDate = new Date();
  nextDueDate.setDate(nextDueDate.getDate() + 1);

  return asaasRequest("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType: "BOLETO",
      value: Number(plan.preco_mensal || 0),
      nextDueDate: nextDueDate.toISOString().slice(0, 10),
      cycle: "MONTHLY",
      description: `Assinatura ${plan.nome} - Clinica SaaS`,
      externalReference: clinic.id,
    }),
  });
}

export async function listAsaasSubscriptionPayments(subscriptionId) {
  if (!subscriptionId) return [];
  const payload = await asaasRequest(`/subscriptions/${subscriptionId}/payments`, {
    method: "GET",
  });

  return payload?.data || [];
}
