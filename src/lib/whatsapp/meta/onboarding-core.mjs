import { createHmac } from "node:crypto";

export const WHATSAPP_MANAGEMENT_SCOPES = Object.freeze([
  "whatsapp_business_management",
  "whatsapp_business_messaging",
]);

function id(value) {
  return String(value || "").trim();
}

function data(payload) {
  return payload?.data || payload || {};
}

export function assertMetaId(value, label) {
  const normalized = id(value);
  if (!/^\d+$/.test(normalized)) throw new Error(`${label} retornado pela Meta é inválido.`);
  return normalized;
}

export function validateDebugToken(payload, {
  appId,
  expectedTypes,
  requiredScopes,
  wabaId,
  targetScopes = requiredScopes,
}) {
  const token = data(payload);
  if (token.is_valid !== true) throw new Error("Token retornado pela Meta é inválido.");
  if (id(token.app_id) !== id(appId)) throw new Error("Token retornado pertence a outro aplicativo Meta.");

  const type = id(token.type).toUpperCase();
  if (!type || !expectedTypes.includes(type)) throw new Error("Tipo de token Meta incompatível com o onboarding.");

  const scopes = new Set(Array.isArray(token.scopes) ? token.scopes : []);
  const missing = requiredScopes.filter((scope) => !scopes.has(scope));
  if (missing.length) throw new Error(`Token Meta sem permissão obrigatória: ${missing.join(", ")}.`);

  const granular = Array.isArray(token.granular_scopes) ? token.granular_scopes : [];
  for (const scope of targetScopes) {
    const entries = granular.filter((entry) => (entry?.scope || entry?.permission) === scope);
    const targets = entries.flatMap((entry) => Array.isArray(entry?.target_ids) ? entry.target_ids.map(id) : []);
    if (entries.length && targets.length && !targets.includes(id(wabaId))) {
      throw new Error(`A WABA selecionada não foi concedida para ${scope}.`);
    }
  }
  return token;
}

export function validateGrantedAssets(waba, phones, wabaId, phoneNumberId) {
  if (id(waba?.id) !== id(wabaId)) throw new Error("A WABA não pertence à autorização recebida.");
  const phone = (phones?.data || []).find((item) => id(item?.id) === id(phoneNumberId));
  if (!phone) throw new Error("O número não pertence à WABA autorizada.");
  return phone;
}

export function hasSystemUser(payload, systemUserId) {
  return (payload?.data || []).some((item) => id(item?.id) === id(systemUserId));
}

export function hasSharedWaba(payload, wabaId) {
  return (payload?.data || []).some((item) => id(item?.id) === id(wabaId));
}

export function hasSubscribedApp(payload, appId) {
  return (payload?.data || []).some((item) => {
    const subscribedId = item?.id || item?.whatsapp_business_api_data?.id;
    return id(subscribedId) === id(appId);
  });
}

export function registrationPin(phoneNumberId, secret) {
  if (!secret || String(secret).length < 32) throw new Error("Segredo de registro dos números Meta não configurado com segurança.");
  const digest = createHmac("sha256", String(secret)).update(`meta-phone:${id(phoneNumberId)}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export async function provisionMetaOnboarding({
  client,
  code,
  wabaId,
  phoneNumberId,
  appId,
  businessId,
  systemUserId,
  permanentToken,
  registrationSecret,
  onStage = async () => {},
  validateTenantOwnership = async () => {},
}) {
  const selectedWabaId = assertMetaId(wabaId, "WABA");
  const selectedPhoneId = assertMetaId(phoneNumberId, "Número");
  const configuredAppId = assertMetaId(appId, "App ID");
  const configuredBusinessId = assertMetaId(businessId, "Business ID");
  const configuredSystemUserId = assertMetaId(systemUserId, "System User ID");
  if (!code) throw new Error("Código de autorização Meta ausente.");
  if (!permanentToken) throw new Error("Credencial permanente da Meta não configurada.");

  const exchange = await client.exchangeEmbeddedSignupCode(code);
  const temporaryToken = exchange?.access_token;
  if (!temporaryToken) throw new Error("A Meta não retornou autorização utilizável.");
  const temporaryDebug = await client.debugToken(temporaryToken);
  validateDebugToken(temporaryDebug, {
    appId: configuredAppId,
    expectedTypes: ["BUSINESS", "SYSTEM_USER"],
    requiredScopes: WHATSAPP_MANAGEMENT_SCOPES,
    wabaId: selectedWabaId,
  });
  await onStage("meta_authorized");

  const [temporaryWaba, temporaryPhones] = await Promise.all([
    client.getWaba(selectedWabaId, temporaryToken),
    client.listPhoneNumbers(selectedWabaId, temporaryToken),
  ]);
  validateGrantedAssets(temporaryWaba, temporaryPhones, selectedWabaId, selectedPhoneId);
  await validateTenantOwnership({ wabaId: selectedWabaId, phoneNumberId: selectedPhoneId });
  await onStage("assets_validated", { waba_id: selectedWabaId, phone_number_id: selectedPhoneId });

  const permanentDebug = await client.debugToken(permanentToken);
  validateDebugToken(permanentDebug, {
    appId: configuredAppId,
    expectedTypes: ["SYSTEM_USER"],
    requiredScopes: ["business_management", ...WHATSAPP_MANAGEMENT_SCOPES],
    targetScopes: WHATSAPP_MANAGEMENT_SCOPES,
    wabaId: selectedWabaId,
  });

  await onStage("system_user_assignment_pending");
  const systemUsers = await client.listSystemUsers(configuredBusinessId, permanentToken);
  if (!hasSystemUser(systemUsers, configuredSystemUserId)) {
    throw new Error("O System User configurado não pertence ao Business Portfolio da NexaWi.");
  }

  let assignedUsers = await client.listAssignedUsers(selectedWabaId, configuredBusinessId, permanentToken);
  let assignmentCreated = false;
  if (!hasSystemUser(assignedUsers, configuredSystemUserId)) {
    await client.assignSystemUser(selectedWabaId, configuredSystemUserId, permanentToken);
    assignmentCreated = true;
    assignedUsers = await client.listAssignedUsers(selectedWabaId, configuredBusinessId, permanentToken);
  }
  if (!hasSystemUser(assignedUsers, configuredSystemUserId)) {
    throw new Error("A Meta não confirmou a atribuição do System User à WABA.");
  }

  const sharedWabas = await client.listClientWabas(configuredBusinessId, permanentToken);
  if (!hasSharedWaba(sharedWabas, selectedWabaId)) {
    throw new Error("A WABA não aparece entre os ativos compartilhados com a NexaWi.");
  }
  await onStage("system_user_assigned", { assignment_created: assignmentCreated });

  await client.subscribeApp(selectedWabaId, permanentToken);
  const subscriptions = await client.listSubscribedApps(selectedWabaId, permanentToken);
  if (!hasSubscribedApp(subscriptions, configuredAppId)) {
    throw new Error("A Meta não confirmou a inscrição do app nos webhooks da WABA.");
  }
  await onStage("webhook_subscribed");

  const pin = registrationPin(selectedPhoneId, registrationSecret);
  await client.registerPhoneNumber(selectedPhoneId, pin, permanentToken);
  await onStage("phone_registered");

  const [permanentWaba, permanentPhones, templatePage] = await Promise.all([
    client.getWaba(selectedWabaId, permanentToken),
    client.listPhoneNumbers(selectedWabaId, permanentToken),
    client.listTemplates(selectedWabaId, null, permanentToken),
  ]);
  const phone = validateGrantedAssets(permanentWaba, permanentPhones, selectedWabaId, selectedPhoneId);
  await onStage("syncing");

  return {
    waba: permanentWaba,
    phone,
    assignmentCreated,
    templateAccessValidated: Array.isArray(templatePage?.data),
  };
}
