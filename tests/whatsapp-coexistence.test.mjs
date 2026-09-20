import test from "node:test";
import assert from "node:assert/strict";
import { embeddedSignupOptions, parseSignupEvent, createSignupAttempt, COEXISTENCE_FINISH } from "../src/lib/whatsapp/embedded-signup-core.mjs";
import { provisionMetaOnboarding, verifiedConnectionMode } from "../src/lib/whatsapp/meta/onboarding-core.mjs";
import { insertMetaMessage } from "../src/lib/whatsapp/meta/message-storage.mjs";
import { graphMock, memoryDatabase, installWhatsAppTestHooks, setDatabase } from "./helpers/whatsapp-db.mjs";
const hooks = installWhatsAppTestHooks();
const { ingestWhatsAppWebhook } = await import("../src/lib/whatsapp/meta/webhooks.js");
const { createEmbeddedSignupSession, completeEmbeddedSignup } = await import("../src/lib/whatsapp/onboarding.js");
const { authorizeCoexistenceImport } = await import("../src/lib/whatsapp/meta/coexistence-import.js");
hooks.deregister();
const origin = "https://www.facebook.com";
const finish = (event = "FINISH", data = { waba_id: "40004", phone_number_id: "50005" }) => ({ type: "WA_EMBEDDED_SIGNUP", event, data });
const args = (mode = "cloud_only") => ({
  client: graphMock(mode), code: "test-code", wabaId: "40004", phoneNumberId: "50005",
  appId: "10001", businessId: "20002", systemUserId: "30003", permanentToken: "test-permanent",
  registrationSecret: "test-registration-secret-at-least-32-characters", requestedMode: mode,
});

test("launcher preserva Cloud e habilita Business App apenas na escolha Coexistence", () => {
  assert.deepEqual(embeddedSignupOptions("config-test", "coexistence"), {
    config_id: "config-test", response_type: "code", override_default_response_type: true,
    extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
  });
  assert.equal(embeddedSignupOptions("test", "cloud_only").extras.featureType, "");
  assert.throws(() => embeddedSignupOptions("test", "spoofed"));
});
test("somente FINISH terminal confiavel captura ativos", () => {
  assert.equal(parseSignupEvent("https://facebook.com.attacker.test", finish(), "cloud_only"), null);
  assert.equal(parseSignupEvent(origin, finish("STEP"), "cloud_only"), null);
  assert.equal(parseSignupEvent(origin, "{bad", "cloud_only"), null);
  assert.equal(parseSignupEvent(origin, finish(), "cloud_only").phoneNumberId, "50005");
  assert.ok(parseSignupEvent(origin, finish(), "coexistence").error);
  assert.ok(parseSignupEvent(origin, finish("FINISH", {}), "cloud_only").error);
  assert.ok(parseSignupEvent(origin, finish("FINISH", { waba_id: "40004" }), "cloud_only").error);
  assert.equal(parseSignupEvent(origin, finish(COEXISTENCE_FINISH, { waba_id: "40004" }), "coexistence").phoneNumberId, "");
  assert.ok(parseSignupEvent(origin, finish(COEXISTENCE_FINISH, {}), "coexistence").error);
});
for (const first of ["code", "finish"]) test("coordenacao OAuth/FINISH em ordem " + first, () => {
  const outcomes = [];
  const attempt = createSignupAttempt("cloud_only", { complete: (value) => outcomes.push(value), fail: assert.fail });
  const code = () => attempt.response({ authResponse: { code: "test-code" } });
  const event = () => attempt.event(origin, finish());
  if (first === "code") { code(); assert.equal(outcomes.length, 0); event(); } else { event(); assert.equal(outcomes.length, 0); code(); }
  event(); code();
  assert.equal(outcomes.length, 1);
});
for (const event of ["CANCEL", "ERROR"]) test(event + " nao reutiliza IDs nem finaliza", () => {
  const errors = [];
  const attempt = createSignupAttempt("cloud_only", { complete: assert.fail, fail: (value) => errors.push(value) });
  attempt.event(origin, finish(event));
  attempt.response({ authResponse: { code: "test-code" } });
  attempt.event(origin, finish());
  assert.equal(errors.length, 1);
});
test("dispose e callback sem code impedem finalizacao", () => {
  const errors = [];
  const attempt = createSignupAttempt("cloud_only", { complete: assert.fail, fail: (value) => errors.push(value) });
  attempt.response({});
  attempt.event(origin, finish());
  assert.equal(errors.length, 1);
  const disposed = createSignupAttempt("cloud_only", { complete: assert.fail, fail: assert.fail });
  disposed.dispose(); disposed.event(origin, finish()); disposed.response({});
});
test("Cloud registra numero; Coexistence nao registra e preserva META-05", async () => {
  for (const mode of ["cloud_only", "coexistence"]) {
    const input = args(mode);
    const result = await provisionMetaOnboarding(input);
    assert.equal(result.connectionMode, mode);
    assert.equal(input.client.calls.includes("register"), mode === "cloud_only");
    assert.ok(input.client.calls.indexOf("assign") < input.client.calls.indexOf("assigned"));
    assert.ok(input.client.calls.includes("subscribe"));
  }
});
test("Coexistence sem phone ID resolve apenas numero unico autorizado", async () => {
  const input = { ...args("coexistence"), phoneNumberId: undefined };
  assert.equal((await provisionMetaOnboarding(input)).phone.id, "50005");
  input.client.listPhoneNumbers = async () => ({ data: [{ id: "50005" }, { id: "50006" }] });
  await assert.rejects(provisionMetaOnboarding(input), /unico numero/);
  input.client.listPhoneNumbers = async () => ({ data: [] });
  await assert.rejects(provisionMetaOnboarding(input), /unico numero/);
  await assert.rejects(provisionMetaOnboarding({ ...args(), phoneNumberId: undefined }), /ausente/);
});
test("modo nao confia no browser e nao aceita indicador ausente", async () => {
  const input = args("coexistence");
  input.client = graphMock("cloud_only");
  await assert.rejects(provisionMetaOnboarding(input), /difere/);
  assert.ok(!input.client.calls.includes("register"));
  assert.throws(() => verifiedConnectionMode({ id: "50005" }, "50005"));
  assert.throws(() => verifiedConnectionMode({ id: "50006", is_on_biz_app: true, platform_type: "CLOUD_API" }, "50005"));
});
test("cross-tenant bloqueia Coexistence antes de mutacoes Meta", async () => {
  const input = args("coexistence");
  input.validateTenantOwnership = async () => { throw new Error("outro tenant"); };
  await assert.rejects(provisionMetaOnboarding(input), /outro tenant/);
  assert.ok(!input.client.calls.includes("assign"));
});

test("persistencia real do service respeita modo da sessao e replay", async () => {
  const env = { META_APP_ID: "10001", META_BUSINESS_ID: "20002", META_SYSTEM_USER_ID: "30003", META_SYSTEM_USER_ACCESS_TOKEN: "test-permanent", META_PHONE_REGISTRATION_SECRET: "test-registration-secret-at-least-32-characters" };
  const original = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    for (const mode of ["cloud_only", "coexistence"]) {
      const db = memoryDatabase();
      setDatabase(db);
      const session = await createEmbeddedSignupSession({ clinicId: "clinic-a", userId: "owner-a", role: "owner", requestOrigin: "https://clinic.example.com", onboardingMode: mode });
      const client = graphMock(mode);
      const call = { state: session.state, code: "test-code", wabaId: "40004", phoneNumberId: mode === "coexistence" ? undefined : "50005", finishEvent: mode === "coexistence" ? COEXISTENCE_FINISH : "FINISH", clinicId: "clinic-a", userId: "owner-a", client };
      await assert.rejects(completeEmbeddedSignup({ ...call, clinicId: "clinic-b" }), /outra clínica/);
      await completeEmbeddedSignup(call);
      const connection = db.tables.whatsapp_connections[0];
      assert.equal(connection.connection_mode, mode);
      assert.equal(connection.phone_number_id, "50005");
      assert.equal(connection.onboarding_status, "ready");
      assert.equal(connection.billing_mode, "client_direct");
      assert.equal(connection.metadata.phone_registration_managed, mode === "cloud_only");
      assert.equal((await completeEmbeddedSignup(call)).replay, true);
      assert.equal(client.calls.filter((name) => name === "exchange").length, 1);
    }
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

function webhookDb(mode = "coexistence") {
  const db = memoryDatabase({
    whatsapp_connections: [{ id: "connection-a", clinica_id: "clinic-a", waba_id: "40004", phone_number_id: "50005", display_phone_number: "5511999990000", connection_mode: mode, connection_status: "connected", onboarding_status: "ready", is_primary: true, connected_at: new Date().toISOString() }],
    whatsapp_automation_settings: [{ clinica_id: "clinic-a", privacy_mode: "minimo" }],
    clientes: [{ id: "client-a", clinica_id: "clinic-a", telefone_whatsapp: "5511999991111" }],
  });
  setDatabase(db);
  return db;
}
function webhook(field, id = "wamid.test", extra = {}) {
  const outbound = field === "smb_message_echoes";
  const message = { id, from: outbound ? "5511999990000" : "5511999991111", to: "5511999991111", timestamp: "1800000000", type: "text", text: { body: "PARAR" }, ...extra };
  return { entry: [{ id: "40004", changes: [{ field, value: { metadata: { phone_number_id: "50005" }, [outbound ? "message_echoes" : "messages"]: [message] } }] }] };
}
test("inbound persiste e executa opt-out apenas uma vez", async () => {
  const db = webhookDb();
  const payload = webhook("messages");
  await ingestWhatsAppWebhook(payload); await ingestWhatsAppWebhook(payload);
  assert.equal(db.tables.whatsapp_messages.length, 1);
  assert.equal(db.tables.whatsapp_messages[0].direction, "inbound");
  assert.equal(db.tables.communication_preferences.length, 1);
  assert.equal(db.tables.eventos_analiticos.length, 1);
});
test("echo outbound associa cliente e nunca executa acao inbound", async () => {
  const db = webhookDb();
  const payload = webhook("smb_message_echoes", "wamid.echo", { button: { payload: "nxw:confirm:test" } });
  await ingestWhatsAppWebhook(payload); await ingestWhatsAppWebhook(payload);
  const row = db.tables.whatsapp_messages[0];
  assert.equal(db.tables.whatsapp_messages.length, 1);
  assert.equal(row.direction, "outbound");
  assert.equal(row.cliente_id, "client-a");
  assert.equal(row.trigger, "business_app_echo");
  assert.equal(row.content.text, undefined);
  assert.equal(db.calls.some(({ table }) => ["communication_preferences", "whatsapp_interaction_tokens", "agendamentos", "eventos_analiticos"].includes(table)), false);
});
test("falha de persistencia permite retry do mesmo webhook sem perder mensagem", async () => {
  const db = webhookDb();
  db.failNextMessage();
  const payload = webhook("smb_message_echoes");
  await assert.rejects(ingestWhatsAppWebhook(payload));
  assert.equal(db.tables.whatsapp_webhook_events[0].status, "received");
  await ingestWhatsAppWebhook(payload);
  assert.equal(db.tables.whatsapp_messages.length, 1);
  assert.equal(db.tables.whatsapp_webhook_events[0].status, "processed");
});
test("dedup Meta ID concorrente usa unique constraint; vinculo diferente e rejeitado", async () => {
  const db = memoryDatabase();
  const row = { clinica_id: "a", connection_id: "conn", direction: "outbound", meta_message_id: "wamid.unique" };
  const results = await Promise.all([insertMetaMessage(db, row), insertMetaMessage(db, row)]);
  assert.equal(results.filter((item) => item.inserted).length, 1);
  await assert.rejects(insertMetaMessage(db, { ...row, clinica_id: "b" }), /incompativel/);
  await assert.rejects(insertMetaMessage(db, { ...row, direction: "inbound" }), /incompativel/);
});
test("WABA/phone devem corresponder juntos e echo Cloud-only e ignorado", async () => {
  let db = webhookDb();
  const forged = webhook("smb_message_echoes");
  forged.entry[0].id = "other-waba";
  assert.equal((await ingestWhatsAppWebhook(forged)).processed, 0);
  assert.equal(db.tables.whatsapp_messages, undefined);
  db = webhookDb("cloud_only");
  assert.equal((await ingestWhatsAppWebhook(webhook("smb_message_echoes"))).processed, 0);
  assert.equal(db.tables.whatsapp_messages, undefined);
});
test("historico/contatos nao solicitados nao importam PII nem disparam automacoes", async () => {
  const db = webhookDb();
  for (const field of ["history", "smb_app_state_sync"]) await ingestWhatsAppWebhook(webhook(field));
  assert.equal(db.tables.whatsapp_messages, undefined);
  assert.equal(db.tables.whatsapp_webhook_events.length, 2);
  assert.ok(db.tables.whatsapp_webhook_events.every((event) => event.status === "ignored" && event.payload.imported === false));
  assert.doesNotMatch(JSON.stringify(db.tables.whatsapp_webhook_events.map((row) => row.payload)), /PARAR|551199/);
});

function importArgs() {
  const calls = [];
  return { clinicId: "clinic-a", userId: "owner-a", role: "owner", authorized: true,
    calls, client: { async syncBusinessAppData(phone, type) { calls.push({ phone, type }); return { request_id: "test-request" }; } } };
}
function syncPayload(field, value) {
  return { entry: [{ id: "40004", changes: [{ field, value: { metadata: { phone_number_id: "50005" }, ...value } }] }] };
}
test("importacao exige opt-in owner/admin, e nao herda autorizacao de outro tenant", async () => {
  webhookDb();
  const input = importArgs();
  await assert.rejects(authorizeCoexistenceImport({ ...input, authorized: false }));
  await assert.rejects(authorizeCoexistenceImport({ ...input, role: "profissional" }));
  await assert.rejects(authorizeCoexistenceImport({ ...input, clinicId: "clinic-b" }));
  assert.equal(input.calls.length, 0);
});
test("consentimento duravel anterior ao request; concorrencia nao duplica importacao", async () => {
  const db = webhookDb();
  const input = importArgs();
  input.client.syncBusinessAppData = async (phone, type) => {
    const run = db.tables.whatsapp_coexistence_imports[0];
    assert.equal(run.authorized_by, "owner-a");
    assert.ok(run.authorized_at && run.consent_version);
    assert.equal(run.requests[type].status, "requested");
    input.calls.push(type);
    return { request_id: "test" };
  };
  await Promise.all([authorizeCoexistenceImport(input), authorizeCoexistenceImport(input)]);
  await authorizeCoexistenceImport(input);
  assert.deepEqual(input.calls, ["smb_app_state_sync", "history"]);
  assert.equal(db.tables.whatsapp_coexistence_imports.length, 1);
});
test("falha da Meta nao afeta ready nem repete operacao unica", async () => {
  const db = webhookDb();
  const input = importArgs();
  input.client.syncBusinessAppData = async () => { input.calls.push("called"); throw new Error("provider-sensitive-payload"); };
  const result = await authorizeCoexistenceImport(input);
  assert.equal(result.requests.history.status, "uncertain");
  assert.equal(db.tables.whatsapp_connections[0].onboarding_status, "ready");
  await authorizeCoexistenceImport(input);
  assert.equal(input.calls.length, 2);
  assert.doesNotMatch(JSON.stringify(db.tables), /provider-sensitive-payload/);
});
test("Cloud-only e janela expirada bloqueiam apenas importacao", async () => {
  webhookDb("cloud_only");
  await assert.rejects(authorizeCoexistenceImport(importArgs()));
  const db = webhookDb();
  db.tables.whatsapp_connections[0].connected_at = "2000-01-01T00:00:00Z";
  await assert.rejects(authorizeCoexistenceImport(importArgs()), /24 horas/);
  assert.equal(db.tables.whatsapp_connections[0].onboarding_status, "ready");
});
test("historico autorizado deduplica IDs e nao confirma agenda nem processa opt-out", async () => {
  const db = webhookDb();
  await authorizeCoexistenceImport(importArgs());
  const payload = syncPayload("history", { history: [{ threads: [{ id: "5511999991111", messages: [
    { id: "wamid.h-in", from: "5511999991111", timestamp: "1800000000", type: "text", text: { body: "PARAR" }, button: { payload: "nxw:confirm:test" } },
    { id: "wamid.h-out", from: "5511999990000", timestamp: "1800000001", type: "text", text: { body: "hello" }, history_context: { status: "READ" } },
  ] }] }] });
  await ingestWhatsAppWebhook(payload); await ingestWhatsAppWebhook(payload);
  assert.equal(db.tables.whatsapp_messages.length, 2);
  assert.equal(db.tables.whatsapp_messages[0].trigger, "business_app_history");
  assert.equal(db.tables.whatsapp_messages[0].content.text, undefined);
  assert.equal(db.tables.whatsapp_messages[1].direction, "outbound");
  assert.equal(db.tables.whatsapp_messages[1].status, "read");
  await ingestWhatsAppWebhook(webhook("messages", "wamid.h-in"));
  assert.equal(db.tables.whatsapp_messages.length, 2);
  assert.equal(db.calls.some(({ table }) => ["communication_preferences", "whatsapp_interaction_tokens", "agendamentos", "eventos_analiticos"].includes(table)), false);
});
test("Meta sem historico compartilhado continua aceitando mensagens novas", async () => {
  const db = webhookDb();
  await authorizeCoexistenceImport(importArgs());
  await ingestWhatsAppWebhook(syncPayload("history", { history: [{ errors: [{ code: 2593109 }] }] }));
  assert.equal(db.tables.whatsapp_webhook_events[0].payload.history_shared, false);
  await ingestWhatsAppWebhook(webhook("smb_message_echoes"));
  assert.equal(db.tables.whatsapp_messages[0].trigger, "business_app_echo");
  assert.equal(db.tables.whatsapp_connections[0].onboarding_status, "ready");
});
test("contatos importados isolados de pacientes e eventos fora de ordem nao ressuscitam removido", async () => {
  const db = webhookDb();
  await authorizeCoexistenceImport(importArgs());
  const contact = (action, time) => syncPayload("smb_app_state_sync", { state_sync: [{ type: "contact", action, contact: { full_name: "Contato ficticio", phone_number: "5511999992222" }, metadata: { timestamp: time } }] });
  await ingestWhatsAppWebhook(contact("add", "1800000000"));
  await ingestWhatsAppWebhook(contact("add", "1800000000"));
  await ingestWhatsAppWebhook(contact("remove", "1800000002"));
  await ingestWhatsAppWebhook(contact("add", "1800000001"));
  assert.equal(db.tables.whatsapp_imported_contacts.length, 1);
  assert.equal(db.tables.whatsapp_imported_contacts[0].removed, true);
  assert.equal(db.tables.whatsapp_imported_contacts[0].full_name, null);
  assert.equal(db.tables.clientes.length, 1);
});
test("consentimento de outro numero nao autoriza historia desta conexao", async () => {
  const db = webhookDb();
  await authorizeCoexistenceImport(importArgs());
  db.tables.whatsapp_coexistence_imports[0].phone_number_id = "different";
  await ingestWhatsAppWebhook(syncPayload("smb_app_state_sync", { state_sync: [{ type: "contact", action: "add", contact: { full_name: "Contato", phone_number: "5511999992222" }, metadata: { timestamp: "1800000000" } }] }));
  assert.equal(db.tables.whatsapp_imported_contacts, undefined);
  assert.equal(db.tables.whatsapp_webhook_events[0].status, "ignored");
});
