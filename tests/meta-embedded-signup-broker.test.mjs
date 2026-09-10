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
  isSafeTopLevelPost,
  isTrustedBrokerMessage,
  normalizeBrokerNavigationMode,
  normalizeHttpOrigin,
  requestOriginFromHeaders,
  shouldUseTopLevelBroker,
} from "../src/lib/whatsapp/broker-core.mjs";
import {
  BROKER_TELEMETRY_EVENTS,
  buildEmbeddedSignupV4LoginOptions,
  isTrustedMetaMessageOrigin,
  metaMessageOriginHostname,
  normalizeBrokerTelemetryPayload,
  sanitizeBrokerTelemetryError,
} from "../src/lib/whatsapp/broker-client-core.mjs";
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

test("POST top-level rejeita origem ou contexto cross-site sem exigir headers ausentes no Safari", () => {
  const base = { requestOrigin: "https://ingridestetica.com.br" };
  assert.equal(isSafeTopLevelPost({ ...base, originHeader: "https://ingridestetica.com.br", secFetchSite: "same-origin" }), true);
  assert.equal(isSafeTopLevelPost({ ...base, originHeader: "", secFetchSite: "" }), true);
  assert.equal(isSafeTopLevelPost({ ...base, originHeader: "https://evil.example", secFetchSite: "same-origin" }), false);
  assert.equal(isSafeTopLevelPost({ ...base, originHeader: "https://ingridestetica.com.br", secFetchSite: "cross-site" }), false);
});

test("dashboard abre popup no clique, nao executa JSSDK e confirma ready no servidor", async () => {
  const dashboard = await source("../src/app/dashboard/whatsapp/embedded-signup-button.js");
  assert.ok(dashboard.indexOf('window.open("about:blank"') < dashboard.indexOf('fetch("/api/whatsapp/embedded-signup/start"'));
  assert.match(dashboard, /async function connectDesktop\(\)[\s\S]+window\.open\("about:blank"/);
  assert.doesNotMatch(dashboard, /FB\.init|FB\.login|connect\.facebook\.net/);
  assert.match(dashboard, /isTrustedBrokerMessage/);
  assert.match(dashboard, /embedded-signup\/status\?sessionId=/);
  assert.match(dashboard, /if \(data\.ready\)/);
  assert.match(dashboard, /window\.location\.replace\(cleanOnboardingReturnUrl\(\)\)/);
});

test("mobile usa POST nativo e nao depende de fetch popup ou location.assign", async () => {
  const dashboard = await source("../src/app/dashboard/whatsapp/embedded-signup-button.js");
  const mobileHandler = dashboard.slice(dashboard.indexOf("function handleConnectClick"), dashboard.indexOf("async function connectDesktop"));
  assert.match(dashboard, /shouldUseTopLevelBroker\(\{/);
  assert.match(dashboard, /window\.matchMedia\?\.\("\(pointer: coarse\)"\)/);
  assert.doesNotMatch(dashboard, /userAgent|navigator\.platform/);
  assert.match(dashboard, /<form ref=\{topLevelFormRef\} method="POST" action="\/api\/whatsapp\/embedded-signup\/start-top-level">/);
  assert.match(mobileHandler, /if \(prefersTopLevelNavigation\(\)\) return;/);
  assert.doesNotMatch(mobileHandler, /fetch\(|window\.open|location\.assign|setStatus|setMessage/);
});

test("endpoint top-level autentica autoriza cria sessao tenant-safe e redireciona com 303", async () => {
  const route = await source("../src/app/api/whatsapp/embedded-signup/start-top-level/route.js");
  assert.match(route, /requireClinicSection\("whatsapp"\)/);
  assert.match(route, /getCurrentMembership\(context\.memberships, context\.activeClinic\.id\)/);
  assert.match(route, /\["owner", "admin"\]\.includes\(membership\?\.papel\)/);
  assert.match(route, /if \(!isMetaConfigured\(\)\)/);
  assert.match(route, /clinicId: context\.activeClinic\.id/);
  assert.match(route, /userId: context\.user\.id/);
  assert.match(route, /requestOrigin,/);
  assert.match(route, /navigationMode: META_BROKER_NAVIGATION_TOP_LEVEL/);
  assert.match(route, /result\.mode !== "broker" \|\| brokerUrl\.origin !== getMetaConnectOrigin\(\)/);
  assert.match(route, /NextResponse\.redirect\(brokerUrl, 303\)/);
});

test("endpoint top-level nao aceita tenant canary host ou retorno do navegador", async () => {
  const route = await source("../src/app/api/whatsapp/embedded-signup/start-top-level/route.js");
  assert.match(route, /isSafeTopLevelPost\(\{/);
  assert.match(route, /originHeader: request\.headers\.get\("origin"\)/);
  assert.match(route, /secFetchSite: request\.headers\.get\("sec-fetch-site"\)/);
  assert.doesNotMatch(route, /request\.json\(|request\.formData\(|searchParams/);
  assert.doesNotMatch(route, /body\?\.(?:clinic|clinica|tenant|return|origin|host)|form\.(?:get|has)/i);
  assert.match(route, /href="\/dashboard\/whatsapp\?tab=conexao"/);
});

test("resposta top-level nao expoe segredo e logs nunca incluem state bruto", async () => {
  const route = await source("../src/app/api/whatsapp/embedded-signup/start-top-level/route.js");
  const successLog = route.slice(route.indexOf('console.info("meta_top_level_signup_started"'), route.indexOf("return NextResponse.redirect"));
  assert.doesNotMatch(route, /META_SYSTEM_USER_ACCESS_TOKEN|META_APP_SECRET|SUPABASE_SERVICE_ROLE_KEY|META_PHONE_REGISTRATION_SECRET/);
  assert.doesNotMatch(successLog, /\bstate\b|brokerUrl/);
  assert.match(route, /sanitizeMetaError\(error\)/);
  assert.match(route, /Content-Security-Policy/);
  assert.match(route, /Referrer-Policy/);
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

test("origem de mensagens Meta aceita apenas HTTPS e host facebook.com legitimo", () => {
  assert.equal(isTrustedMetaMessageOrigin("https://www.facebook.com"), true);
  assert.equal(isTrustedMetaMessageOrigin("https://business.facebook.com"), true);
  assert.equal(isTrustedMetaMessageOrigin("https://facebook.com"), true);
  assert.equal(metaMessageOriginHostname("https://web.facebook.com"), "web.facebook.com");
  assert.equal(isTrustedMetaMessageOrigin("http://www.facebook.com"), false);
  assert.equal(isTrustedMetaMessageOrigin("https://facebook.com.evil.example"), false);
  assert.equal(isTrustedMetaMessageOrigin("https://evilfacebook.com"), false);
  assert.equal(isTrustedMetaMessageOrigin("https://www.facebook.com:444"), false);
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

test("FB.login e a primeira operacao sensivel do clique e preserva a ativacao", async () => {
  const broker = await source("../src/app/whatsapp/connect/broker-client.js");
  const launcher = broker.slice(broker.indexOf("function launchMetaSignup"), broker.indexOf("const actionDisabled"));
  const loginIndex = launcher.indexOf("window.FB.login");
  const beforeLogin = launcher.slice(0, loginIndex);

  assert.ok(loginIndex > 0);
  assert.match(beforeLogin, /window\.navigator\.userActivation\?\.isActive \?\? null/);
  assert.doesNotMatch(beforeLogin, /recordTelemetry|fetch\(|setLaunching|setShowReturnAction|setStatus|setMessage|setTimeout/);
  assert.ok(launcher.indexOf('recordTelemetry("fb_login_returned_sync"') > loginIndex);
  assert.ok(launcher.indexOf("loginTimeoutRef.current = window.setTimeout") > loginIndex);
});

test("exception sincrona do FB.login e capturada sem deixar timeout ativo", async () => {
  const broker = await source("../src/app/whatsapp/connect/broker-client.js");
  const launcher = broker.slice(broker.indexOf("function launchMetaSignup"), broker.indexOf("const actionDisabled"));
  const throwEventIndex = launcher.indexOf('recordTelemetry("fb_login_threw"');
  const catchStart = launcher.lastIndexOf("} catch (error) {", throwEventIndex);
  const catchEnd = launcher.indexOf('\n    }\n\n    recordTelemetry("continue_meta_clicked")', throwEventIndex);
  const catchBlock = launcher.slice(catchStart, catchEnd);

  assert.match(launcher, /window\.FB\.login\([\s\S]+buildEmbeddedSignupV4LoginOptions\(configId\)\);\n    } catch \(error\) \{/);
  assert.match(catchBlock, /recordTelemetry\("fb_login_threw"/);
  assert.match(catchBlock, /sanitizeBrokerTelemetryError\(error\)/);
  assert.match(catchBlock, /clearLoginTimeout\(\)/);
  assert.match(catchBlock, /Não foi possível iniciar a autorização da Meta\./);
  assert.match(catchBlock, /return;/);
  assert.doesNotMatch(catchBlock, /fb_login_timeout|window\.setTimeout/);
});

test("payload Embedded Signup V4 e exato e encaminhamento FINISH permanece inalterado", async () => {
  const broker = await source("../src/app/whatsapp/connect/broker-client.js");
  assert.deepEqual(buildEmbeddedSignupV4LoginOptions("config-test"), {
    config_id: "config-test",
    auth_type: "rerequest",
    response_type: "code",
    override_default_response_type: true,
    extras: { setup: {} },
  });
  assert.match(broker, /buildEmbeddedSignupV4LoginOptions\(configId\)/);
  assert.doesNotMatch(broker, /sessionInfoVersion|featureType|\bscope\b/);
  assert.match(broker, /data\.event === "FINISH"/);
  assert.match(broker, /wabaId: data\?\.data\?\.waba_id/);
  assert.match(broker, /phoneNumberId: data\?\.data\?\.phone_number_id/);
  assert.match(broker, /sendOutcome\(\{ code, wabaId, phoneNumberId \}\)/);
});

test("SDK do broker usa HTTPS async defer e CORS anonimo sem voltar ao dashboard", async () => {
  const [broker, dashboard] = await Promise.all([
    source("../src/app/whatsapp/connect/broker-client.js"),
    source("../src/app/dashboard/whatsapp/embedded-signup-button.js"),
  ]);
  assert.match(broker, /script\.src = "https:\/\/connect\.facebook\.net\/pt_BR\/sdk\.js"/);
  assert.match(broker, /script\.async = true/);
  assert.match(broker, /script\.defer = true/);
  assert.match(broker, /script\.crossOrigin = "anonymous"/);
  assert.doesNotMatch(dashboard, /connect\.facebook\.net|FB\.init|FB\.login/);
});

test("telemetria aceita apenas eventos enumerados e metadados Meta sanitizados", () => {
  assert.deepEqual(BROKER_TELEMETRY_EVENTS, [
    "broker_rendered", "sdk_script_loading", "sdk_script_loaded", "fb_init_completed",
    "continue_meta_clicked", "fb_login_invoked", "fb_login_returned_sync", "fb_login_threw", "document_visibility_hidden",
    "document_visibility_visible", "pagehide", "pageshow", "meta_message_received",
    "meta_finish", "meta_cancel", "meta_error", "fb_login_callback_received",
    "fb_login_callback_without_code", "fb_login_timeout",
  ]);
  assert.deepEqual(normalizeBrokerTelemetryPayload({ state: "opaque", event: "fb_login_invoked" }), {
    state: "opaque",
    log: { event: "fb_login_invoked" },
  });
  assert.equal(normalizeBrokerTelemetryPayload({ state: "opaque", event: "arbitrary" }), null);
  assert.equal(normalizeBrokerTelemetryPayload({ state: "opaque", event: "fb_login_invoked", payload: "forbidden" }), null);
  assert.equal(normalizeBrokerTelemetryPayload({ state: "x".repeat(129), event: "fb_login_invoked" }), null);
  assert.deepEqual(normalizeBrokerTelemetryPayload({
    state: "opaque",
    event: "meta_message_received",
    meta_hostname: "business.facebook.com",
    meta_type: "WA_EMBEDDED_SIGNUP",
    meta_event: "FINISH",
  }), {
    state: "opaque",
    log: {
      event: "meta_message_received",
      meta_hostname: "business.facebook.com",
      meta_type: "WA_EMBEDDED_SIGNUP",
      meta_event: "FINISH",
    },
  });
  assert.equal(normalizeBrokerTelemetryPayload({
    state: "opaque",
    event: "meta_message_received",
    meta_hostname: "facebook.com.evil.example",
    meta_type: "WA_EMBEDDED_SIGNUP",
    meta_event: "FINISH",
  }), null);
});

test("telemetria de FB.login aceita somente ativacao e erro sanitizado", () => {
  assert.deepEqual(normalizeBrokerTelemetryPayload({
    state: "opaque",
    event: "fb_login_returned_sync",
    user_activation_before: true,
  }), {
    state: "opaque",
    log: { event: "fb_login_returned_sync", user_activation_before: true },
  });
  assert.deepEqual(normalizeBrokerTelemetryPayload({
    state: "opaque",
    event: "fb_login_returned_sync",
    user_activation_before: null,
  }), {
    state: "opaque",
    log: { event: "fb_login_returned_sync", user_activation_before: null },
  });
  assert.equal(normalizeBrokerTelemetryPayload({
    state: "opaque",
    event: "fb_login_returned_sync",
    user_activation_before: "true",
  }), null);
  assert.equal(normalizeBrokerTelemetryPayload({
    state: "opaque",
    event: "fb_login_returned_sync",
    user_activation_before: true,
    config_id: "forbidden",
  }), null);
  assert.equal(normalizeBrokerTelemetryPayload({
    state: "opaque",
    event: "fb_login_threw",
    user_activation_before: true,
  }), null);

  const thrown = normalizeBrokerTelemetryPayload({
    state: "opaque",
    event: "fb_login_threw",
    user_activation_before: false,
    error_name: "TypeError",
    error_message: "Falha https://example.test/callback?state=secret access_token=secret-value app_id=1726181268669685 id 550e8400-e29b-41d4-a716-446655440000",
  });
  assert.equal(thrown.log.event, "fb_login_threw");
  assert.equal(thrown.log.user_activation_before, false);
  assert.equal(thrown.log.error_name, "TypeError");
  assert.doesNotMatch(thrown.log.error_message, /https:|example\.test|secret-value|1726181268669685|550e8400/i);
  assert.ok(thrown.log.error_message.length <= 240);
});

test("sanitizacao de exception nao preserva credenciais, URLs, IDs ou texto ilimitado", () => {
  const error = sanitizeBrokerTelemetryError({
    name: "InvalidStateError",
    message: `Bearer abcdefghijklmnopqrstuvwxyz password=hunter2 https://example.test/path?code=abc 1435901121729318 ${"x".repeat(260)}`,
  });
  assert.equal(error.error_name, "InvalidStateError");
  assert.ok(error.error_message.length <= 240);
  assert.doesNotMatch(error.error_message, /abcdefghijklmnopqrstuvwxyz|hunter2|https:|example\.test|1435901121729318/);
});

test("endpoint de telemetria valida origem e sessao e nunca registra state ou secrets", async () => {
  const route = await source("../src/app/api/whatsapp/embedded-signup/broker/telemetry/route.js");
  assert.match(route, /isMetaConnectRequestOrigin\(requestOrigin\)/);
  assert.match(route, /isMetaConnectRequestOrigin\(suppliedOrigin\)/);
  assert.match(route, /normalizeBrokerTelemetryPayload\(await request\.json\(\)\)/);
  assert.match(route, /getEmbeddedSignupBrokerSession\(\{ state: telemetry\.state \}\)/);
  const log = route.slice(route.indexOf('console.info("meta_embedded_signup_telemetry"'), route.indexOf("return new Response"));
  assert.match(log, /session_id: session\.sessionId/);
  assert.doesNotMatch(log, /telemetry\.state|\bstate\b|code|token|waba|phone|authorization|cookie/i);
  assert.doesNotMatch(route, /META_SYSTEM_USER_ACCESS_TOKEN|META_APP_SECRET|SUPABASE_SERVICE_ROLE_KEY|META_PHONE_REGISTRATION_SECRET/);
});

test("broker emite a sequencia operacional sem enviar ativos ou credenciais", async () => {
  const broker = await source("../src/app/whatsapp/connect/broker-client.js");
  for (const event of BROKER_TELEMETRY_EVENTS) assert.match(broker, new RegExp(`"${event}"`));
  const telemetry = broker.slice(broker.indexOf("const recordTelemetry"), broker.indexOf("const notifyOpener"));
  assert.doesNotMatch(telemetry, /code|wabaId|phoneNumberId|access.?token|app.?secret|authorization|cookie/i);
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
  assert.match(start, /navigationMode: META_BROKER_NAVIGATION_POPUP/);
  assert.doesNotMatch(start, /request\.json\(|request\.formData\(/);
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
