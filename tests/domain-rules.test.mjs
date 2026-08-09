import test from "node:test";
import assert from "node:assert/strict";
import { intervalsOverlap, totalAppointmentMinutes } from "../src/lib/domain/schedule-core.mjs";
import { summarizeFinancialRecords } from "../src/lib/domain/finance-core.mjs";
import { matchesDemoEmail, shouldRestoreDemoSession } from "../src/lib/domain/demo-core.mjs";
import { canAccessByPolicy } from "../src/lib/domain/permission-core.mjs";

const validSections = ["dashboard", "agenda", "financeiro", "configuracoes"];
const roleAccess = { recepcao: ["dashboard", "agenda"], financeiro: ["dashboard", "financeiro"] };

test("agenda soma procedimentos e detecta conflitos sem bloquear horários adjacentes", () => {
  assert.equal(totalAppointmentMinutes([{ duracao_minutos: 45 }, { duracao_minutos: 60 }]), 105);
  assert.equal(intervalsOverlap(540, 645, 600, 660), true);
  assert.equal(intervalsOverlap(540, 600, 600, 660), false);
});

test("financeiro exclui cancelados do previsto e mantém apenas recebimentos válidos", () => {
  const summary = summarizeFinancialRecords([
    { status: "confirmado", valor: 200, pagamentos: [{ status: "pago", valor: 80 }] },
    { status: "cancelado", valor: 300, pagamentos: [] },
    { status: "concluido", valor: 150, pagamentos: [{ status: "estornado", valor: 150 }] },
  ]);
  assert.deepEqual(summary, { expected: 350, received: 80, pending: 270 });
});

test("permissões respeitam papel e acesso personalizado", () => {
  const access = (role, section, membership = null) => canAccessByPolicy({ role, section, membership, validSections, roleAccess });
  assert.equal(access("owner", "configuracoes"), true);
  assert.equal(access("recepcao", "financeiro"), false);
  assert.equal(access("recepcao", "financeiro", { permissoes: { secoes: ["financeiro"] } }), true);
  assert.equal(access("recepcao", "agenda", { permissoes: { secoes: ["financeiro"] } }), false);
});

test("demo é identificada sem diferença de caixa e só restaura sessão autenticada", () => {
  assert.equal(matchesDemoEmail(" DEMO@NEXAWI.COM.BR ", "demo@nexawi.com.br"), true);
  assert.equal(matchesDemoEmail("cliente@nexawi.com.br", "demo@nexawi.com.br"), false);
  assert.equal(shouldRestoreDemoSession({ demoClinic: true, authenticated: true }), true);
  assert.equal(shouldRestoreDemoSession({ demoClinic: true, authenticated: false }), false);
});
