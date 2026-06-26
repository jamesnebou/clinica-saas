function getAsaasConfig(config = {}) {
  const apiKey = config.apiKey || config.asaas_api_key || process.env.ASAAS_API_KEY;
  const baseUrl = String(config.baseUrl || config.asaas_base_url || process.env.ASAAS_BASE_URL || "https://sandbox.asaas.com/api/v3").replace(/\/$/, "");

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
