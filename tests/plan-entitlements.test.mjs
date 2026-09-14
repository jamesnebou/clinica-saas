import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanComparison, formatPlanLimit, planHasEntitlement } from "../src/lib/saas/plan-entitlements.mjs";
import { toMarketingPlans } from "../src/lib/marketing/plans.js";

const catalog = [
  { slug: "starter", nome: "Starter", preco_mensal: 97, limite_usuarios: 1, limite_profissionais: 1, limite_clientes: 50, limite_agendamentos_mes: 200, metadata: {} },
  { slug: "growth", nome: "Growth", preco_mensal: 197, limite_usuarios: 8, limite_profissionais: 5, limite_clientes: 1000, limite_agendamentos_mes: 3000, metadata: {} },
  { slug: "premium", nome: "Premium", preco_mensal: 397, limite_usuarios: 15, limite_profissionais: 10, limite_clientes: 4000, limite_agendamentos_mes: 10000, metadata: {} },
];

test("registry comercial deixa Starter útil e Growth/Premium completos", () => {
  assert.equal(planHasEntitlement("starter", "agenda"), true);
  assert.equal(planHasEntitlement("starter", "clientes"), true);
  assert.equal(planHasEntitlement("starter", "procedimentos"), true);
  assert.equal(planHasEntitlement("starter", "site"), true);
  assert.equal(planHasEntitlement("starter", "financeiro"), true);
  assert.equal(planHasEntitlement("starter", "crm"), false);
  assert.equal(planHasEntitlement("starter", "automacoes"), false);
  assert.equal(planHasEntitlement("starter", "bi"), false);
  assert.equal(planHasEntitlement("starter", "financeiro_avancado"), false);
  assert.equal(planHasEntitlement("growth", "crm"), true);
  assert.equal(planHasEntitlement("growth", "financeiro_avancado"), true);
  assert.equal(planHasEntitlement("growth", "automacoes"), true);
  assert.equal(planHasEntitlement("growth", "bi"), true);
  assert.equal(planHasEntitlement("growth", "team_permissions"), true);
  assert.equal(planHasEntitlement("growth", "dominio_personalizado"), true);
  assert.equal(planHasEntitlement("growth", "dre"), false);
  assert.equal(planHasEntitlement("growth", "ecommerce"), false);

  assert.equal(planHasEntitlement("premium", "dre"), true);
  assert.equal(planHasEntitlement("premium", "ecommerce"), true);
  assert.equal(planHasEntitlement("premium", "automacoes_ampliadas"), true);
});

test("preços e limites da landing continuam vindos do catálogo e pluralizam corretamente", () => {
  const plans = toMarketingPlans(catalog);
  assert.match(plans[0].price, /97/);
  assert.deepEqual(plans[0].limits, ["1 usuário", "1 profissional", "50 pacientes", "200 agendamentos/mês"]);
  assert.equal(plans[1].badge, "Recomendado");
  assert.equal(formatPlanLimit(1, "usuário"), "1 usuário");
  assert.equal(formatPlanLimit(2, "profissional", "profissionais"), "2 profissionais");
  assert.equal(plans[2].catalogLimits.agendamentos_mes, 10000);
  assert.equal(toMarketingPlans([{ ...catalog[0], slug: "STARTER" }])[0].slug, "starter");
  assert.equal(toMarketingPlans([{ ...catalog[1], slug: "plano-crescimento", nome: "Growth" }])[0].slug, "growth");
});

test("comparação usa a mesma matriz de entitlements e limites recebidos", () => {
  const comparison = buildPlanComparison(toMarketingPlans(catalog));
  const limits = comparison.find((category) => category.id === "limits");
  const crm = comparison.find((category) => category.id === "comercial").rows.find((row) => row.id === "crm");
  assert.equal(limits.rows.find((row) => row.id === "usuarios").plans.starter, 1);
  assert.equal(limits.rows.find((row) => row.id === "agendamentos_mes").plans.premium, 10000);
  assert.equal(crm.plans.starter, false);
  assert.equal(crm.plans.growth, true);

});
