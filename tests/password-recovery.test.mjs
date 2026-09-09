import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const loginActions = source("src/app/login/actions.js");
const recoveryPage = source("src/app/auth/recovery/page.js");
const recoveryBridge = source("src/app/auth/recovery/password-recovery-bridge.js");
const authCallback = source("src/app/auth/callback/route.js");

test("recuperacao usa fluxo que funciona fora do navegador solicitante", () => {
  assert.match(loginActions, /flowType:\s*"implicit"/);
  assert.match(loginActions, /auth\/recovery\?next=\/login-cliente\/nova-senha/);
  assert.match(loginActions, /auth\/recovery\?next=\/login\/nova-senha/);
});

test("ponte aceita somente fragmento de recuperacao completo", () => {
  assert.match(recoveryBridge, /fragment\.get\("type"\) === "recovery"/);
  assert.match(recoveryBridge, /fragment\.has\("access_token"\)/);
  assert.match(recoveryBridge, /fragment\.has\("refresh_token"\)/);
  assert.match(recoveryBridge, /supabase\.auth\.getSession\(\)/);
});

test("destinos de nova senha e erro permanecem internos e separados por perfil", () => {
  assert.match(recoveryPage, /safeInternalNext/);
  assert.match(recoveryPage, /\/login-cliente\/recuperar-senha\?erro=link/);
  assert.match(recoveryPage, /\/login\/recuperar-senha\?erro=link/);
});

test("confirmacao de cadastro continua usando callback PKCE existente", () => {
  assert.match(authCallback, /exchangeCodeForSession\(code\)/);
});
