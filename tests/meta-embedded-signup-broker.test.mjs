import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  META_BROKER_MESSAGE_TYPE,
  META_BROKER_NAVIGATION_POPUP,
  META_BROKER_NAVIGATION_TOP_LEVEL,
  isExpectedBrokerOrigin,
  isMetaConnectCanary,
  isPlatformReturnOrigin,
  isTrustedBrokerMessage,
  normalizeBrokerNavigationMode,
  normalizeHttpOrigin,
  requestOriginFromHeaders,
  shouldUseTopLevelBroker,
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

test("canary aceita clinic id ou hostname exato configurado no servidor", () => {
  const options = {
    clinicId: "clinic-ingrid",
    returnOrigin: "https://ingridestetica.com.br",
    clinicIds: "clinic-other,clinic-ingrid",
    hosts: "another.example",
  };
  assert.equal(isMetaConnectCanary(options), true);
  assert.equal(isMetaConnectCanary({ ...options, clinicId: "clinic-outside", hosts: "ingridestetica.com.br" }), true);
  assert.equal(isMetaConnectCanary({ ...options, clinicId: "clinic-outside", hosts: "www.ingridestetica.com.br" }), false);
  assert.equal(isMetaConnectCanary({ ...options, clinicId: "clinic-outside", returnOrigin: "https://fake-ingridestetica.com.br", hosts: "ingridestetica.com.br" }), false);
});

test("tenant fora do canary permanece no fluxo legado", () => {
  assert.equal(isMetaConnectCanary({
    clinicId: "clinic-outside",
    returnOrigin: "https://outside.example",
    clinicIds: "clinic-ingrid",
    hosts: "ingridestetica.com.br",
  }), false);
});

test("navegacao top-level e escolhida somente para tela pequena com toque sem usar User-Agent", () => {
  assert.equal(shouldUseTopLevelBroker({ viewportWidth: 390, coarsePointer: true, maxTouchPoints: 5 }), true);
  assert.equal(shouldUseTopLevelBroker({ viewportWidth: 390, coarsePointer: false, maxTouchPoints: 1 }), true);
  assert.equal(shouldUseTopLevelBroker({ viewportWidth: 390, coarsePointer: false, maxTouchPoints: 0 }), false);
  assert.equal(shouldUseTopLevelBroker({ viewportWidth: 1440, coarsePointer: true, maxTouchPoints: 5 }), false);
  assert.equal(normalizeBrokerNavigationMode("top_level"), META_BROKER_NAVIGATION_TOP_LEVEL);
  assert.equal(normalizeBrokerNavigationMode("tampered"), META_BROKER_NAVIGATION_POPUP);
});

test("dashboard abre popup no clique, nao executa JSSDK e confirma ready no servidor", async () => {
  const dashboard = await source("../src/app/dashboard/whatsapp/embedded-signup-button.js");
  assert.ok(dashboard.indexOf('window.open("about:blank"') < dashboard.indexOf('fetch("/api/whatsapp/embedded-signup/start"'));
  assert.match(dashboard, /navigationMode === META_BROKER_NAVIGATION_POPUP[\s\S]+window\.open\("about:blank"/);
  assert.doesNotMatch(dashboard, /FB\.init|FB\.login|connect\.facebook\.net/);
  assert.match(dashboard, /isTrustedBrokerMessage/);
  assert.match(dashboard, /embedded-signup\/status\?sessionId=/);
  assert.match(dashboard, /if \(data\.ready\)/);
  assert.match(dashboard, /window\.location\.replace\(cleanOnboardingReturnUrl\(\)\)/);
});

test("mobile navega para o broker sem abrir popup", async () => {
  const dashboard = await source("../src/app/dashboard/whatsapp/embedded-signup-button.js");
  assert.match(dashboard, /shouldUseTopLevelBroker\(\{/);
  assert.match(dashboard, /window\.matchMedia\?\.\("\(pointer: coarse\)"\)/);
  assert.doesNotMatch(dashboard, /userAgent|navigator\.platform/);
  assert.match(dashboard, /navigationMode === META_BROKER_NAVIGATION_TOP_LEVEL[\s\S]+window\.location\.assign\(data\.brokerUrl\)/);
});

test("fluxo broker carrega e executa o Facebook JSSDK somente na pagina central", async () => {
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

test("fbAsyncInit apenas inicializa o SDK e habilita a acao do usuario", async () => {
  const broker = await source("../src/app/whatsapp/connect/broker-client.js");
  const initializer = broker.slice(broker.indexOf("const initializeSdk"), broker.indexOf("function launchMetaSignup"));
  assert.match(initializer, /window\.FB\.init/);
  assert.match(initializer, /setSdkReady\(true\)/);
  assert.match(initializer, /setMessage\("Tudo pronto para continuar\."\)/);
  assert.doesNotMatch(initializer, /FB\.login/);
});

test("FB.login ocorre somente no handler ligado ao clique explicito", async () => {
  const broker = await source("../src/app/whatsapp/connect/broker-client.js");
  const launcher = broker.slice(broker.indexOf("function launchMetaSignup"));
  assert.match(launcher, /function launchMetaSignup\(\)/);
  assert.match(launcher, /window\.FB\.login/);
  assert.match(broker, /onClick=\{launchMetaSignup\}/);
  assert.match(broker, />\{launching \? "Abrindo Meta\.\.\." : "Continuar com a Meta"\}<\/button>/);
});

test("trava sincrona impede duplo clique e cancelamento permite nova tentativa", async () => {
  const broker = await source("../src/app/whatsapp/connect/broker-client.js");
  assert.match(broker, /launchingRef\.current \|\| terminal\.current/);
  assert.match(broker, /launchingRef\.current = true/);
  assert.match(broker, /const attempt = \+\+attemptRef\.current/);
  assert.match(broker, /data\.event === "CANCEL"[\s\S]+resetForRetry/);
  assert.match(broker, /setStatus\("ready"\)/);
  assert.doesNotMatch(broker, /sendOutcome\(\{ outcome: "meta_cancelled" \}\)/);
});

test("timeout restaura a UI sem consumir nem duplicar a sessao", async () => {
  const broker = await source("../src/app/whatsapp/connect/broker-client.js");
  const launcher = broker.slice(broker.indexOf("function launchMetaSignup"), broker.indexOf("const actionDisabled"));
  const beforeLogin = launcher.slice(0, launcher.indexOf("window.FB.login"));
  assert.match(launcher, /META_LOGIN_UI_TIMEOUT_MS = 30_000|META_LOGIN_UI_TIMEOUT_MS/);
  assert.match(launcher, /Não foi possível abrir a Meta\. Tente novamente\./);
  assert.doesNotMatch(beforeLogin, /await |fetch\(/);
  assert.doesNotMatch(launcher.slice(launcher.indexOf("loginTimeoutRef.current = window.setTimeout"), launcher.indexOf("window.FB.login")), /sendOutcome|embedded-signup\/start/);
});

test("payload Embedded Signup e encaminhamento FINISH permanecem inalterados", async () => {
  const broker = await source("../src/app/whatsapp/connect/broker-client.js");
  assert.match(broker, /config_id: configId/);
  assert.match(broker, /response_type: "code"/);
  assert.match(broker, /override_default_response_type: true/);
  assert.match(broker, /extras: \{ setup: \{\}, featureType: "", sessionInfoVersion: "3" \}/);
  assert.match(broker, /data\.event === "FINISH"/);
  assert.match(broker, /wabaId: data\?\.data\?\.waba_id/);
  assert.match(broker, /phoneNumberId: data\?\.data\?\.phone_number_id/);
  assert.match(broker, /sendOutcome\(\{ code, wabaId, phoneNumberId \}\)/);
  assert.doesNotMatch(broker, /auth_type/);
});

test("dashboard escolhe o fluxo somente pelo mode retornado pelo backend", async () => {
  const [dashboard, onboarding, start, legacyCallback] = await Promise.all([
    source("../src/app/dashboard/whatsapp/embedded-signup-button.js"),
    source("../src/lib/whatsapp/onboarding.js"),
    source("../src/app/api/whatsapp/embedded-signup/start/route.js"),
    source("../src/app/api/whatsapp/embedded-signup/callback/route.js"),
  ]);
  assert.match(dashboard, /data\.mode === "legacy"/);
  assert.match(dashboard, /data\.mode !== "broker"/);
  assert.match(dashboard, /import\("\.\/legacy-embedded-signup"\)/);
  assert.match(start, /navigationMode: normalizeBrokerNavigationMode\(body\?\.navigationMode\)/);
  assert.doesNotMatch(start, /body\?\.(?:clinic|clinica|tenant|return|origin)/i);
  assert.match(onboarding, /isClinicMetaConnectCanary\(\{ clinicId, returnOrigin \}\)/);
  assert.match(onboarding, /mode: "legacy"/);
  assert.match(onboarding, /mode: "broker"/);
  assert.match(onboarding, /metadata\?\.flow_mode !== "broker"/);
  assert.match(onboarding, /metadata\?\.flow_mode === "broker"/);
  assert.match(legacyCallback, /completeEmbeddedSignupLegacy/);
});

test("tenant canary recebe URL do broker e retorno validado permanece server-side", async () => {
  const onboarding = await source("../src/lib/whatsapp/onboarding.js");
  assert.match(onboarding, /const brokerUrl = new URL\("\/whatsapp\/connect", connectOrigin\)/);
  assert.match(onboarding, /brokerUrl\.searchParams\.set\("state", state\)/);
  assert.match(onboarding, /return_origin: returnOrigin/);
  assert.match(onboarding, /navigation_mode: normalizedNavigationMode/);
});

test("retorno top-level e construido somente da origem armazenada na sessao", async () => {
  const [onboarding, callback] = await Promise.all([
    source("../src/lib/whatsapp/onboarding.js"),
    source("../src/app/api/whatsapp/embedded-signup/broker/callback/route.js"),
  ]);
  assert.match(onboarding, /new URL\("\/dashboard\/whatsapp", normalizeStoredReturnOrigin\(session\.metadata\?\.return_origin\)\)/);
  assert.match(onboarding, /url\.searchParams\.set\("whatsapp_session", session\.id\)/);
  assert.match(onboarding, /returnUrl: brokerDashboardReturnUrl\(session, "completed"\)/);
  assert.match(callback, /returnUrl: result\.returnUrl/);
  assert.doesNotMatch(callback, /body\?\.(?:return|origin|url)/i);
});

test("query completed isolada nunca falsifica conexao pronta", async () => {
  const dashboard = await source("../src/app/dashboard/whatsapp/embedded-signup-button.js");
  assert.match(dashboard, /const returnedSessionId = params\.get\("whatsapp_session"\)/);
  assert.match(dashboard, /if \(returnedSessionId\)[\s\S]+checkServerStatus\(\)/);
  assert.match(dashboard, /if \(data\.ready\)/);
  assert.match(dashboard, /A conexão ainda não foi confirmada\. Tente novamente\./);
  assert.doesNotMatch(dashboard, /whatsapp_onboarding[^\n]+===\s*["']completed["']/);
});

test("retorno cancelado libera nova tentativa sem consumir a sessao", async () => {
  const dashboard = await source("../src/app/dashboard/whatsapp/embedded-signup-button.js");
  assert.match(dashboard, /returnedOutcome === "cancelled" \? "idle" : "error"/);
  assert.match(dashboard, /Conexão cancelada\. Você pode tentar novamente\./);
  assert.match(dashboard, /window\.history\.replaceState\(\{\}, "", cleanOnboardingReturnUrl\(\)\)/);
});

test("sucesso top-level redireciona e desktop preserva postMessage", async () => {
  const broker = await source("../src/app/whatsapp/connect/broker-client.js");
  assert.match(broker, /if \(!topLevelNavigation && notifyOpener\(result\)\)/);
  assert.match(broker, /window\.location\.assign\(safeReturnUrl\)/);
  assert.match(broker, /finishBrowserFlow\("completed", outcome\.returnUrl \|\| completedReturnUrl\)/);
  assert.match(broker, /postMessage\(\{ type: META_BROKER_MESSAGE_TYPE, sessionId, result \}, returnOrigin\)/);
});

test("conexoes existentes continuam impedindo exibicao do botao de onboarding", async () => {
  const page = await source("../src/app/dashboard/whatsapp/page.js");
  assert.match(page, /manager && !connection \? <EmbeddedSignupButton\/> : null/);
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
  assert.match(onboarding, /\.eq\("clinica_id", clinicId\)[\s\S]+\.eq\("user_id", userId\)/);
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
    source("../src/app/dashboard/whatsapp/legacy-embedded-signup.js"),
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
  assert.match(env, /META_CONNECT_CANARY_CLINIC_IDS=/);
  assert.match(env, /META_CONNECT_CANARY_HOSTS=/);
});
