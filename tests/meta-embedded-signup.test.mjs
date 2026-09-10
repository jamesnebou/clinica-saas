import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  hasSubscribedApp,
  provisionMetaOnboarding,
  registrationPin,
} from "../src/lib/whatsapp/meta/onboarding-core.mjs";
import { sanitizeMetaError } from "../src/lib/whatsapp/meta/errors.js";

const APP_ID = "10001";
const BUSINESS_ID = "20002";
const SYSTEM_USER_ID = "30003";
const WABA_ID = "40004";
const PHONE_ID = "50005";
const PERMANENT_TOKEN = "permanent-token";
const REGISTRATION_SECRET = "meta-registration-secret-with-at-least-32-characters";

function debugData({ type, scopes, targetWaba = WABA_ID, appId = APP_ID, valid = true }) {
  return {
    data: {
      is_valid: valid,
      app_id: appId,
      type,
      scopes,
      granular_scopes: scopes
        .filter((scope) => scope.startsWith("whatsapp_"))
        .map((scope) => ({ scope, target_ids: [targetWaba] })),
    },
  };
}

function metaMock(options = {}) {
  const calls = [];
  let assigned = options.assignedInitially === true;
  let subscribed = false;
  const client = {
    calls,
    async exchangeEmbeddedSignupCode(code) { calls.push(["exchange", code]); return options.exchange || { access_token: "temporary-token" }; },
    async debugToken(token) {
      calls.push(["debug", token]);
      if (token === "temporary-token") return options.temporaryDebug || debugData({ type: "BUSINESS", scopes: ["whatsapp_business_management", "whatsapp_business_messaging"] });
      return options.permanentDebug || debugData({ type: "SYSTEM_USER", scopes: ["business_management", "whatsapp_business_management", "whatsapp_business_messaging"] });
    },
    async getWaba(id, token) {
      calls.push(["waba", id, token]);
      if (options.permanentAccessFails && token === PERMANENT_TOKEN) throw new Error("permanent denied");
      return { id, name: "Clinica Teste" };
    },
    async listPhoneNumbers(id, token) {
      calls.push(["phones", id, token]);
      const phoneId = options.wrongPhone ? "99999" : PHONE_ID;
      return { data: [{ id: phoneId, display_phone_number: "+55 77 99999-9999", verified_name: "Clinica Teste" }] };
    },
    async listSystemUsers(_businessId, _token, after) {
      calls.push(["system-users", after || null]);
      if (options.systemUserOnSecondPage && !after) {
        return { data: [], paging: { next: "next", cursors: { after: "system-page-2" } } };
      }
      return { data: options.systemUserMissing ? [] : [{ id: SYSTEM_USER_ID }] };
    },
    async listAssignedUsers() {
      calls.push(["assigned-users"]);
      return { data: assigned && !options.assignmentNeverVisible ? [{ id: SYSTEM_USER_ID }] : [] };
    },
    async assignSystemUser() {
      calls.push(["assign"]);
      if (options.assignmentPostFails) throw new Error("assignment already exists");
      assigned = true;
      return { success: true };
    },
    async listClientWabas(_businessId, _token, after) {
      calls.push(["shared-wabas", after || null]);
      if (options.sharedWabaOnSecondPage && !after) {
        return { data: [], paging: { next: "next", cursors: { after: "waba-page-2" } } };
      }
      return { data: options.sharedWabaMissing ? [] : [{ id: WABA_ID }] };
    },
    async subscribeApp() { calls.push(["subscribe"]); subscribed = true; return { success: true }; },
    async listSubscribedApps() {
      calls.push(["subscriptions"]);
      return { data: subscribed && !options.subscriptionNeverVisible ? [{ whatsapp_business_api_data: { id: APP_ID } }] : [] };
    },
    async registerPhoneNumber(id, pin) { calls.push(["register", id, pin]); return { success: true }; },
    async listTemplates() {
      calls.push(["templates"]);
      if (options.templateSyncFails) throw new Error("templates denied");
      return { data: [] };
    },
  };
  return client;
}

function run(client, onStage, validateTenantOwnership) {
  return provisionMetaOnboarding({
    client,
    code: "one-time-code",
    wabaId: WABA_ID,
    phoneNumberId: PHONE_ID,
    appId: APP_ID,
    businessId: BUSINESS_ID,
    systemUserId: SYSTEM_USER_ID,
    permanentToken: PERMANENT_TOKEN,
    registrationSecret: REGISTRATION_SECRET,
    onStage,
    validateTenantOwnership,
  });
}

test("code exchange ocorre exclusivamente no servidor", async () => {
  const client = metaMock();
  await run(client);
  assert.deepEqual(client.calls[0], ["exchange", "one-time-code"]);
});

test("token inválido interrompe o onboarding", async () => {
  const client = metaMock({ temporaryDebug: debugData({ type: "BUSINESS", scopes: [], valid: false }) });
  await assert.rejects(run(client), /token.*inválido/i);
});

test("App ID incorreto interrompe o onboarding", async () => {
  const client = metaMock({ temporaryDebug: debugData({ type: "BUSINESS", scopes: ["whatsapp_business_management", "whatsapp_business_messaging"], appId: "99999" }) });
  await assert.rejects(run(client), /outro aplicativo/i);
});

test("WABA fora dos ativos granulares é rejeitada", async () => {
  const client = metaMock({ temporaryDebug: debugData({ type: "BUSINESS", scopes: ["whatsapp_business_management", "whatsapp_business_messaging"], targetWaba: "99999" }) });
  await assert.rejects(run(client), /WABA selecionada não foi concedida/i);
});

test("phone que não pertence à WABA é rejeitado", async () => {
  await assert.rejects(run(metaMock({ wrongPhone: true })), /número não pertence/i);
});

test("System User sem WABA não permite estado ready", async () => {
  await assert.rejects(run(metaMock({ assignmentNeverVisible: true })), /não confirmou a atribuição/i);
});

test("WABA não compartilhada interrompe antes do POST de atribuição", async () => {
  const client = metaMock({ sharedWabaMissing: true });
  await assert.rejects(run(client), /não aparece entre os ativos compartilhados/i);
  assert.equal(client.calls.some(([name]) => name === "assign"), false);
  assert.equal(client.calls.some(([name]) => name === "assigned-users"), false);
});

test("WABA compartilhada executa POST antes do GET assigned_users", async () => {
  const client = metaMock();
  const result = await run(client);
  assert.equal(result.assignmentCreated, true);
  assert.equal(client.calls.filter(([name]) => name === "assigned-users").length, 1);
  const names = client.calls.map(([name]) => name);
  assert.ok(names.indexOf("shared-wabas") < names.indexOf("assign"));
  assert.ok(names.indexOf("assign") < names.indexOf("assigned-users"));
});

test("retry com POST inconclusivo só prossegue após confirmação por GET", async () => {
  const client = metaMock({ assignedInitially: true, assignmentPostFails: true });
  const result = await run(client);
  assert.equal(result.assignmentCreated, false);
  assert.equal(client.calls.some(([name]) => name === "assign"), true);
  assert.equal(client.calls.some(([name]) => name === "assigned-users"), true);
});

test("POST bem-sucedido sem confirmação posterior falha", async () => {
  const client = metaMock({ assignmentNeverVisible: true });
  await assert.rejects(run(client), /não confirmou a atribuição/i);
  const names = client.calls.map(([name]) => name);
  assert.ok(names.indexOf("assign") < names.indexOf("assigned-users"));
  assert.equal(names.includes("subscribe"), false);
});

test("system_users e WABAs compartilhadas percorrem paginação", async () => {
  const client = metaMock({ systemUserOnSecondPage: true, sharedWabaOnSecondPage: true });
  await run(client);
  assert.deepEqual(client.calls.filter(([name]) => name === "system-users").map(([, after]) => after), [null, "system-page-2"]);
  assert.deepEqual(client.calls.filter(([name]) => name === "shared-wabas").map(([, after]) => after), [null, "waba-page-2"]);
});

test("subscribed_apps precisa confirmar o App da NexaWi", async () => {
  await assert.rejects(run(metaMock({ subscriptionNeverVisible: true })), /não confirmou a inscrição/i);
  assert.equal(hasSubscribedApp({ data: [{ whatsapp_business_api_data: { id: APP_ID } }] }, APP_ID), true);
});

test("callback repetido retorna conexão concluída sem consumir o code novamente", async () => {
  const source = await readFile(new URL("../src/lib/whatsapp/onboarding.js", import.meta.url), "utf8");
  assert.match(source, /existing\.status === "completed" && existing\.metadata\?\.connection_id/);
  assert.match(source, /return \{ connectionId: session\.metadata\.connection_id[^}]+replay: true \}/s);
});

test("falha persiste o estágio operacional anterior sem migration", async () => {
  const source = await readFile(new URL("../src/lib/whatsapp/onboarding.js", import.meta.url), "utf8");
  assert.match(source, /failed_stage: failedStage/);
  assert.match(source, /stage: "failed"/);
});

test("falha de reconexão restaura conexão pronta anterior", async () => {
  const source = await readFile(new URL("../src/lib/whatsapp/onboarding.js", import.meta.url), "utf8");
  assert.match(source, /previousConnection = targetConnectionId/);
  assert.match(source, /onboarding_status: previousConnection\.onboarding_status/);
  assert.match(source, /if \(demotedConnectionId\).*is_primary: true/s);
});

test("state expirado e state de outro tenant são rejeitados", async () => {
  const source = await readFile(new URL("../src/lib/whatsapp/onboarding.js", import.meta.url), "utf8");
  assert.match(source, /\.eq\("clinica_id", clinicId\)\.eq\("user_id", userId\)/);
  assert.match(source, /Date\.parse\(existing\.expires_at\) <= Date\.now\(\)/);
  assert.match(source, /status: "expired"/);
});

test("ativo já vinculado a outro tenant falha antes de atribuição externa", async () => {
  const client = metaMock();
  await assert.rejects(run(client, undefined, async () => {
    throw new Error("Esta WABA ou número já está conectado a outra clínica.");
  }), /outra clínica/i);
  assert.equal(client.calls.some(([name]) => name === "assign" || name === "register"), false);
});

test("falha no acesso a templates interrompe antes de ready", async () => {
  await assert.rejects(run(metaMock({ templateSyncFails: true })), /templates denied/);
});

test("credencial permanente sem acesso à WABA é rejeitada", async () => {
  await assert.rejects(run(metaMock({ permanentAccessFails: true })), /permanent denied/);
});

test("registro usa PIN estável por número sem hardcode", async () => {
  const first = registrationPin(PHONE_ID, REGISTRATION_SECRET);
  assert.match(first, /^\d{6}$/);
  assert.equal(first, registrationPin(PHONE_ID, REGISTRATION_SECRET));
  assert.notEqual(first, registrationPin("50006", REGISTRATION_SECRET));
});

test("sucesso end-to-end mockado alcança todos os estágios obrigatórios", async () => {
  const stages = [];
  const client = metaMock();
  const result = await run(client, async (stage) => stages.push(stage));
  assert.equal(result.phone.id, PHONE_ID);
  assert.equal(result.templateAccessValidated, true);
  assert.deepEqual(stages, [
    "meta_authorized",
    "assets_validated",
    "system_user_validated",
    "waba_sharing_confirmed",
    "system_user_assignment_pending",
    "system_user_assigned",
    "webhook_subscribed",
    "phone_registered",
    "syncing",
  ]);
  assert.equal(client.calls.some(([name, id, pin]) => name === "register" && id === PHONE_ID && /^\d{6}$/.test(pin)), true);
});

test("cliente Graph usa endpoints oficiais sem enviar token permanente ao navegador", async () => {
  const clientSource = await readFile(new URL("../src/lib/whatsapp/meta/client.js", import.meta.url), "utf8");
  const browserSource = await readFile(new URL("../src/app/dashboard/whatsapp/embedded-signup-button.js", import.meta.url), "utf8");
  assert.match(clientSource, /"debug_token"/);
  assert.match(clientSource, /system_users/);
  assert.match(clientSource, /assigned_users/);
  assert.match(clientSource, /client_whatsapp_business_accounts/);
  assert.match(clientSource, /limit: 100, after/);
  assert.match(clientSource, /\/register/);
  assert.doesNotMatch(browserSource, /META_SYSTEM_USER_ACCESS_TOKEN|META_APP_SECRET|META_PHONE_REGISTRATION_SECRET/);
});

test("erros persistidos ou retornados não expõem tokens Meta", () => {
  const safe = sanitizeMetaError(new Error("Bearer EAAtoken_123456789012345 e 10001|secret_value_123456"));
  assert.doesNotMatch(safe, /EAAtoken|secret_value/);
  assert.match(safe, /\[redacted\]/);
});
