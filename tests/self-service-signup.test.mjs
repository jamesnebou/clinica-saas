import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildSelfServiceUserMetadata,
  friendlySignupError,
  normalizeSelectedPlan,
  normalizeSignupPhone,
  safeInternalNext,
  validateSelfServiceSignup,
} from "../src/lib/auth/self-service.mjs";
import { marketingPhoneCandidates } from "../src/lib/tracking/core.mjs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const cadastroPage = source("src/app/cadastro/page.js");
const cadastroAction = source("src/app/cadastro/actions.js");
const leaveDemo = source("src/app/auth/leave-demo/route.js");
const loginAction = source("src/app/login/actions.js");
const loginPage = source("src/app/login-cliente/page.js");
const onboarding = source("src/app/onboarding/actions.js");
const onboardingPage = source("src/app/onboarding/page.js");
const homepage = source("src/app/page.js");
const marketingPortal = source("src/components/marketing/marketing-portal.js");
const planCta = source("src/components/marketing/plan-cta.js");
const demoCta = source("src/components/demo/demo-conversion-cta.js");
const demoRoute = source("src/app/demo/route.js");
const proxy = source("src/proxy.js");

function validInput(overrides = {}) {
  return {
    name: "Maria da Silva",
    email: "maria@clinica.com.br",
    phone: "(77) 99999-8888",
    password: "senha-segura",
    passwordConfirm: "senha-segura",
    acceptedTerms: true,
    selectedPlan: "growth",
    ...overrides,
  };
}

test("visitante anônimo possui uma página pública de cadastro", () => {
  assert.match(cadastroPage, /CadastroForm/);
  assert.match(proxy, /login-cliente\|cadastro\|onboarding/);
});

test("signup válido normaliza os dados e chama o Auth público", () => {
  const result = validateSelfServiceSignup(validInput());
  assert.equal(result.ok, true);
  assert.equal(result.value.phone, "5577999998888");
  assert.match(cadastroAction, /supabase\.auth\.signUp/);
  assert.doesNotMatch(cadastroAction, /auth\.admin\.createUser/);
});

test("signup estabelece onboarding quando o Supabase devolve sessão", () => {
  assert.match(cadastroAction, /if \(data\.session\) redirect\(onboardingPath\)/);
  assert.match(cadastroAction, /requiresEmailConfirmation: true/);
});

test("e-mail duplicado recebe mensagem amigável", () => {
  assert.match(friendlySignupError({ code: "user_already_exists" }), /já pode possuir uma conta/i);
});

test("senha fraca é rejeitada", () => {
  assert.equal(validateSelfServiceSignup(validInput({ password: "123", passwordConfirm: "123" })).ok, false);
});

test("senhas diferentes são rejeitadas", () => {
  assert.match(validateSelfServiceSignup(validInput({ passwordConfirm: "outra-senha" })).message, /não confere/i);
});

test("termos não aceitos são rejeitados", () => {
  assert.match(validateSelfServiceSignup(validInput({ acceptedTerms: false })).message, /Termos de Uso/i);
});

test("e-mail da Demo é reservado", () => {
  const result = validateSelfServiceSignup(validInput({ email: "demo@nexawi.com.br" }), { demoEmail: "demo@nexawi.com.br" });
  assert.equal(result.ok, false);
});

test("administrador interno não pode nascer pelo cadastro público", () => {
  const result = validateSelfServiceSignup(validInput({ email: "admin@nexawi.com.br" }), { internalAdminEmails: ["admin@nexawi.com.br"] });
  assert.equal(result.ok, false);
  const metadata = buildSelfServiceUserMetadata(validInput());
  assert.deepEqual(Object.keys(metadata).sort(), ["name", "phone", "selected_plan", "signup_source"]);
  assert.equal("role" in metadata, false);
  assert.equal("internal_admin" in metadata, false);
});

test("usuário real sem clínica acessando cadastro segue para onboarding", () => {
  assert.match(cadastroPage, /if \(user\) redirect\(`\/onboarding\?plan=/);
});

test("usuário real com clínica acessando cadastro segue para dashboard", () => {
  assert.match(cadastroPage, /if \(user && activeClinic\) redirect\("\/dashboard"\)/);
});

test("conta Demo acessando cadastro passa pela saída segura", () => {
  assert.match(cadastroPage, /auth\/leave-demo\?next=/);
  assert.match(leaveDemo, /isDemoLoginEmail\(user\.email\)/);
});

test("saída da Demo não encerra uma conta normal", () => {
  const demoBranch = leaveDemo.slice(leaveDemo.indexOf("if (user && isDemoLoginEmail"), leaveDemo.indexOf("if (user)"));
  assert.match(demoBranch, /auth\.signOut/);
  assert.doesNotMatch(leaveDemo.slice(leaveDemo.indexOf("if (user)")), /auth\.signOut/);
});

test("redirecionamentos externos e barras invertidas são bloqueados", () => {
  assert.equal(safeInternalNext("https://evil.example", "/cadastro"), "/cadastro");
  assert.equal(safeInternalNext("//evil.example", "/cadastro"), "/cadastro");
  assert.equal(safeInternalNext("/\\evil.example", "/cadastro"), "/cadastro");
  assert.equal(safeInternalNext("/cadastro?plan=growth", "/"), "/cadastro?plan=growth");
});

test("CTAs de começar apontam para cadastro", () => {
  assert.match(homepage, /MarketingPortal/);
  assert.match(marketingPortal, /TrackedLink href="\/cadastro" eventName="signup_click"/);
  assert.match(planCta, /\/cadastro\?plan=/);
});

test("CTAs demonstrativos continuam apontando para demo", () => {
  assert.match(marketingPortal, /TrackedLink href="\/demo" eventName="demo_click"/);
});

test("login do cliente continua usando signInAction e oferece cadastro", () => {
  assert.match(loginAction, /export async function signInAction/);
  assert.match(loginPage, /href="\/cadastro"/);
});

test("recuperação do cliente não exige administrador interno", () => {
  const clientReset = loginAction.slice(loginAction.indexOf("requestClientPasswordResetAction"), loginAction.indexOf("updateRecoveredPasswordAction"));
  assert.match(clientReset, /resetPasswordForEmail/);
  assert.doesNotMatch(clientReset, /findInternalAdminByEmail/);
});

test("onboarding continua criando o vínculo owner", () => {
  assert.match(onboarding, /from\("usuarios_clinica"\)/);
  assert.match(onboarding, /papel: "owner"/);
});

test("CompleteRegistration permanece depois da criação da clínica", () => {
  assert.ok(onboarding.indexOf("eventName: \"CompleteRegistration\"") > onboarding.indexOf(".from(\"clinicas\")"));
  assert.doesNotMatch(cadastroAction, /CompleteRegistration/);
});

test("atribuição UTM atravessa cadastro e onboarding", () => {
  assert.match(cadastroAction, /marketing_attribution: attribution/);
  assert.match(onboarding, /user\.user_metadata\?\.marketing_attribution/);
});

test("telefone do signup chega pré-preenchido ao onboarding", () => {
  assert.match(onboardingPage, /userPhone=\{user\.user_metadata\?\.phone/);
  assert.equal(normalizeSignupPhone("+55 77 99999-8888"), "5577999998888");
});

test("lead pode continuar sendo localizado com ou sem código do país", () => {
  assert.deepEqual(marketingPhoneCandidates("5577999998888"), ["5577999998888", "77999998888"]);
});

test("plano selecionado é normalizado e sobrevive ao onboarding", () => {
  assert.equal(normalizeSelectedPlan("Starter"), "starter");
  assert.equal(normalizeSelectedPlan("PREMIUM"), "premium");
  assert.equal(normalizeSelectedPlan("plano-inventado"), "starter");
  assert.match(onboarding, /selected_plan_intent: selectedPlan/);
});

test("Demo continua usando o reset oficial antes do login", () => {
  assert.match(demoRoute, /ensureDemoAccountAndReset\(\)/);
  assert.match(demoCta, /auth\/leave-demo/);
});

test("migration do cadastro é aditiva e indexa o rate limit", () => {
  const migration = source("supabase/migrations/20260831130000_self_service_signup_rate_limit.sql");
  assert.match(migration, /create index if not exists/i);
  assert.match(migration, /ip_hash, created_at desc/i);
  assert.doesNotMatch(migration, /drop table|drop column|truncate/i);
});
