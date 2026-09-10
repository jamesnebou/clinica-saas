import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  META_BROKER_MESSAGE_TYPE,
  isExpectedBrokerOrigin,
  isPlatformReturnOrigin,
  isTrustedBrokerMessage,
  normalizeHttpOrigin,
  requestOriginFromHeaders,
} from "../src/lib/whatsapp/broker-core.mjs";
import { hashOpaqueToken } from "../src/lib/whatsapp/core.mjs";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("origens HTTP sao normalizadas e credenciais ou protocolos inseguros sao rejeitados", () => {
  assert.equal(normalizeHttpOrigin("https://connect.nexawi.com.br/path"), "https://connect.nexawi.com.br");
  assert.equal(normalizeHttpOrigin("javascript:alert(1)"), null);
  assert.equal(normalizeHttpOrigin("https://user:pass@connect.nexawi.com.br"), null);
  assert.equal(requestOriginFromHeaders({ forwardedHost: "clinica.example.com, proxy.local", forwardedProto: "https" }), "https://clinica.example.com");
});

test("dominio NexaWi, subdominio e Preview sao origens de plataforma validas", () => {
  const base = { primaryHosts: "clinicas.nexawi.com.br,nexawi.com.br", appOrigins: [], nodeEnv: "production" };
  assert.equal(isPlatformReturnOrigin("https://clinicas.nexawi.com.br", base), true);
  assert.equal(isPlatformReturnOrigin("https://cliente.nexawi.com.br", base), true);
  assert.equal(isPlatformReturnOrigin("https://evilnexawi.com.br", base), false);
  assert.equal(isPlatformReturnOrigin("https://branch.vercel.app", { ...base, vercelEnvironment: "preview" }), true);
});

test("mensagem do popup exige origin, janela, tipo e sessao exatos", () => {
  const popup = {};
  const valid = { type: META_BROKER_MESSAGE_TYPE, sessionId: "session-a", result: "completed" };
  const base = { expectedOrigin: "https://connect.nexawi.com.br", popupWindow: popup, data: valid, sessionId: "session-a" };
  assert.equal(isTrustedBrokerMessage({ ...base, eventOrigin: "https://connect.nexawi.com.br", eventSource: popup }), true);
  assert.equal(isTrustedBrokerMessage({ ...base, eventOrigin: "https://fake.example", eventSource: popup }), false);
  assert.equal(isTrustedBrokerMessage({ ...base, eventOrigin: "https://connect.nexawi.com.br", eventSource: {} }), false);
  assert.equal(isTrustedBrokerMessage({ ...base, eventOrigin: "https://connect.nexawi.com.br", eventSource: popup, sessionId: "session-b" }), false);
  assert.equal(isExpectedBrokerOrigin("https://connect.nexawi.com.br/path", "https://connect.nexawi.com.br"), true);
});

test("state alterado produz hash diferente", () => {
  assert.notEqual(hashOpaqueToken("opaque-state"), hashOpaqueToken("opaque-state-tampered"));
});

test("dashboard abre popup no clique, nao executa JSSDK e confirma ready no servidor", async () => {
  const dashboard = await source("../src/app/dashboard/whatsapp/embedded-signup-button.js");
  assert.ok(dashboard.indexOf('window.open("about:blank"') < dashboard.indexOf('fetch("/api/whatsapp/embedded-signup/start"'));
  assert.doesNotMatch(dashboard, /FB\.init|FB\.login|connect\.facebook\.net/);
  assert.match(dashboard, /isTrustedBrokerMessage/);
  assert.match(dashboard, /embedded-signup\/status\?sessionId=/);
  assert.match(dashboard, /if \(data\.ready\)/);
  assert.match(dashboard, /window\.location\.reload\(\)/);
});

test("somente o broker central carrega e executa o Facebook JSSDK", async () => {
  const [broker, page] = await Promise.all([
    source("../src/app/whatsapp/connect/broker-client.js"),
    source("../src/app/whatsapp/connect/page.js"),
  ]);
  assert.match(broker, /window\.FB\.init/);
  assert.match(broker, /window\.FB\.login/);
  assert.match(broker, /https:\/\/connect\.facebook\.net\/pt_BR\/sdk\.js/);
  assert.match(page, /isMetaConnectRequestOrigin/);
  assert.match(page, /notFound\(\)/);
});

test("postMessage usa targetOrigin armazenado e nunca wildcard", async () => {
  const broker = await source("../src/app/whatsapp/connect/broker-client.js");
  assert.match(broker, /postMessage\([^;]+returnOrigin\)/s);
  assert.doesNotMatch(broker, /postMessage\([^;]+["']\*["']/s);
});

test("sessao e vinculada no servidor ao tenant, usuario, papel e origem", async () => {
  const [onboarding, start, brokerServer] = await Promise.all([
    source("../src/lib/whatsapp/onboarding.js"),
    source("../src/app/api/whatsapp/embedded-signup/start/route.js"),
    source("../src/lib/whatsapp/broker.js"),
  ]);
  assert.match(onboarding, /clinica_id: clinicId/);
  assert.match(onboarding, /user_id: userId/);
  assert.match(onboarding, /initiated_role: role/);
  assert.match(onboarding, /return_origin: returnOrigin/);
  assert.match(onboarding, /state_hash: hashOpaqueToken\(state\)/);
  assert.match(onboarding, /15 \* 60_000/);
  assert.match(start, /\["owner","admin"\]\.includes\(membership\?\.papel\)/);
  assert.match(brokerServer, /\.eq\("clinica_id", clinicId\)/);
  assert.match(brokerServer, /\.from\("clinica_dominios"\)/);
});

test("status e consumo impedem leitura cross-tenant e tratam expiracao e replay", async () => {
  const onboarding = await source("../src/lib/whatsapp/onboarding.js");
  assert.match(onboarding, /\.eq\("id", sessionId\)\s*\.eq\("clinica_id", clinicId\)\s*\.eq\("user_id", userId\)/s);
  assert.match(onboarding, /Date\.parse\(session\.expires_at\) <= Date\.now\(\)/);
  assert.match(onboarding, /status: "expired"/);
  assert.match(onboarding, /existing\.status === "completed" && existing\.metadata\?\.connection_id/);
  assert.match(onboarding, /existing\.status !== "pending"/);
});

test("callback deriva o tenant da sessao e ignora tenant e return_url do navegador", async () => {
  const [callback, onboarding] = await Promise.all([
    source("../src/app/api/whatsapp/embedded-signup/broker/callback/route.js"),
    source("../src/lib/whatsapp/onboarding.js"),
  ]);
  assert.doesNotMatch(callback, /body\?\.(?:clinic|clinica|tenant|return)/i);
  assert.match(callback, /completeEmbeddedSignupFromBroker/);
  assert.match(onboarding, /clinicId: session\.clinica_id, userId: session\.user_id/);
  assert.match(onboarding, /outra clínica/);
});

test("nenhum cliente recebe credenciais server-side", async () => {
  const clientSources = await Promise.all([
    source("../src/app/dashboard/whatsapp/embedded-signup-button.js"),
    source("../src/app/whatsapp/connect/broker-client.js"),
    source("../src/app/whatsapp/connect/page.js"),
  ]);
  assert.doesNotMatch(clientSources.join("\n"), /META_SYSTEM_USER_ACCESS_TOKEN|META_APP_SECRET|SUPABASE_SERVICE_ROLE_KEY|META_PHONE_REGISTRATION_SECRET/);
});

test("META_CONNECT_ORIGIN e configuravel e o host central nao sofre rewrite", async () => {
  const [brokerServer, proxy, env] = await Promise.all([
    source("../src/lib/whatsapp/broker.js"),
    source("../src/proxy.js"),
    source("../.env.example"),
  ]);
  assert.match(brokerServer, /process\.env\.META_CONNECT_ORIGIN/);
  assert.match(proxy, /process\.env\.META_CONNECT_ORIGIN/);
  assert.match(env, /META_CONNECT_ORIGIN=/);
});
