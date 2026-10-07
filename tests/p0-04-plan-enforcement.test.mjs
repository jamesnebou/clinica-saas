import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  clinicHasEntitlement,
  effectivePlanAccess,
  entitlementUpgradeMessage,
  FINANCE_NAV_ENTITLEMENT,
  FINANCE_REPORT_ENTITLEMENT,
} from "../src/lib/saas/plan-entitlements.mjs";

const clinic = (plano, mode = "catalog_v1") => ({ id: "clinic-a", plano, plan_entitlements_mode: mode, plan_entitlements_version: 1 });
const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("matriz P0-04 dos planos comerciais", () => {
  for (const [plan, expected] of Object.entries({
    starter: [false, false, false],
    growth: [true, true, false],
    premium: [true, true, true],
  })) {
    assert.deepEqual(
      ["dominio_personalizado", "financeiro_avancado", "dre"].map((capability) => clinicHasEntitlement(clinic(plan), capability)),
      expected,
    );
  }
  assert.equal(clinicHasEntitlement(clinic("starter"), "financeiro"), true);
  assert.equal(entitlementUpgradeMessage("dre"), "Recurso exclusivo do plano Premium.");
});

test("modos especiais independem do plano comercial", () => {
  for (const mode of ["unlimited_lifetime", "internal_full_access"]) {
    for (const capability of ["dominio_personalizado", "financeiro_avancado", "dre"]) {
      assert.equal(clinicHasEntitlement(clinic("starter", mode), capability), true);
    }
  }
});

test("estado desconhecido e tenant forjado falham fechados", () => {
  for (const unknown of [
    null,
    { ...clinic("growth"), plan_entitlements_mode: null },
    { ...clinic("growth"), plan_entitlements_mode: "unknown" },
    { ...clinic("growth"), plan_entitlements_version: null },
    clinic("unknown"),
  ]) {
    assert.equal(clinicHasEntitlement(unknown, "dominio_personalizado"), false);
  }
  assert.equal(clinicHasEntitlement(clinic("premium"), "unknown_capability"), false);
  assert.equal(effectivePlanAccess({ clinic: clinic("premium"), capability: "dre", membership: { clinica_id: "clinic-b" }, userAllowed: true }), false);
  assert.equal(effectivePlanAccess({ clinic: clinic("premium"), capability: "dre", membership: { clinica_id: "clinic-a" }, userAllowed: false }), false);
  assert.equal(effectivePlanAccess({ clinic: clinic("premium"), capability: "dre", membership: { clinica_id: "clinic-a" }, userAllowed: true }), true);
});

test("URL, exportacao, navegacao e Server Actions usam a mesma capability", async () => {
  assert.equal(FINANCE_NAV_ENTITLEMENT["/dashboard/financeiro/dre"], "dre");
  assert.equal(FINANCE_REPORT_ENTITLEMENT.dre, "dre");
  for (const [path, capability] of [
    ["src/app/dashboard/financeiro/dre/page.js", "dre"],
    ["src/app/dashboard/financeiro/pacotes/page.js", "financeiro_avancado"],
    ["src/app/dashboard/financeiro/movimentacoes/layout.js", "financeiro_avancado"],
    ["src/app/dashboard/financeiro/conciliacao/page.js", "conciliacao"],
  ]) {
    assert.match(await source(path), new RegExp(`requireClinicCapability\\("financeiro", "${capability}"`));
  }
  const session = await source("src/lib/auth/session.js");
  assert.match(session, /const context = await requireClinicSection\(section\)/);
  assert.match(session, /\.eq\("id", clinic\.id\)/);
  assert.match(session, /if \(error \|\| !data \|\| data\.id !== clinic\.id\) return null/);
  const actions = await source("src/app/dashboard/actions.js");
  assert.match(actions, /export async function syncClinicDomainAction\(formData\) \{\s*await requireClinicCapability/);
  assert.match(actions, /export async function removeClinicDomainAction\(formData\) \{\s*await requireClinicSection\("configuracoes"\);[\s\S]*?requireClinicManager\(memberships, clinicaId/);
  assert.match(await source("src/app/dashboard/configuracoes/page.js"), /canSync=\{canManageDomain\} canRemove=\{\["owner", "admin"\]\.includes\(membership\?\.papel\)\}/);
  assert.match(actions, /if \(dominio && canManageDomain\)/);
  assert.match(actions, /\.eq\("clinica_id", clinicaId\)\.eq\("dominio", normalized\)/);
  const financeActions = await source("src/app/dashboard/financeiro/actions.js");
  assert.match(financeActions, /scope\("financeiro_avancado"\)/);
  assert.match(financeActions, /scope\("comissoes"\)/);
  assert.match(financeActions, /requireClinicCapability\("financeiro", "conciliacao"\)/);
  assert.match(await source("src/app/dashboard/financeiro/export/route.js"), /clinicHasEntitlement\(entitlementClinic, FINANCE_REPORT_ENTITLEMENT\[reportName\]\)/);
  assert.match(await source("src/app/dashboard/financeiro/finance-nav.js"), /allowedPaths\.includes\(href\)/);
  const plans = await source("src/lib/saas/plans.js");
  assert.match(plans, /if \(isFullAccessClinic\(clinic\)\) return FALLBACK_PLANS\.ilimitado/);
  assert.match(plans, /if \(isFullAccessClinic\(clinic\)\) \{[\s\S]*?Acesso sem prazo de expiração/);
  assert.match(plans, /assertClinicOperational\(clinic\);\s*if \(isFullAccessClinic\(clinic\)\) return/);
  const subscription = await source("src/app/dashboard/assinatura/actions.js");
  assert.match(subscription, /isFullAccessClinic\(entitlementClinic\)/);
  assert.match(await source("src/app/dashboard/assinatura/page.js"), /isFullAccessClinic\(activeClinic\)/);
});

test("migration generica protege atribuicao comercial sem depender de tenants de producao", async () => {
  const migration = await source("supabase/migrations/20261006172000_plan_entitlements_v1.sql");
  assert.match(migration, /plan_entitlements_mode text default 'catalog_v1'/);
  assert.match(migration, /where plano is null or plano not in \('starter', 'growth', 'premium'\)/);
  assert.doesNotMatch(migration, /metadata ->> 'demo_full_access'/);
  assert.match(migration, /auth\.jwt\(\)->>'role'/);
  assert.match(migration, /clinic_has_entitlement\(clinica_id, 'custom_domain'\)/);
  assert.match(migration, /c\.plano in \('growth', 'premium'\)/);
  assert.match(migration, /clinica_dominios_delete_admin/);
  assert.match(migration, /begin;[\s\S]*commit;/i);
  for (const id of ["a5fc1411-87d5-4853-8c71-899527cc3020", "55283218-7df6-4d0b-b29f-504fd6401291", "02b282a5-e678-4467-af03-ea9c550d606e"]) {
    assert.doesNotMatch(migration, new RegExp(id));
  }
  assert.doesNotMatch(migration, /demo_environments/);
  assert.doesNotMatch(migration, /where nome\s*=/i);
  assert.match(await source("src/lib/demo/service.js"), /plan_entitlements_mode: "internal_full_access"/);
});

test("migration de producao classifica somente Ingrid e Demo por UUID", async () => {
  const migration = await source("supabase/migrations/20261006172100_plan_entitlements_special_tenants.sql");
  assert.match(migration, /^--[^\n]*\nbegin;[\s\S]*commit;\s*$/i);
  assert.match(migration, /if v_found <> 2 then/);
  assert.match(migration, /get diagnostics v_found = row_count/);
  assert.match(migration, /'a5fc1411-87d5-4853-8c71-899527cc3020'::uuid then 'unlimited_lifetime'/);
  assert.match(migration, /'55283218-7df6-4d0b-b29f-504fd6401291'::uuid then 'internal_full_access'/);
  assert.doesNotMatch(migration, /02b282a5-e678-4467-af03-ea9c550d606e|demo_environments|where nome\s*=|where slug\s*=/i);
});

test("suite SQL de staging usa somente fixtures transacionais sinteticas", async () => {
  const sql = await source("tests/p0-04-entitlement-bypass.sql");
  assert.match(sql, /begin;[\s\S]*rollback;\s*$/i);
  assert.match(sql, /'unlimited_lifetime',1/);
  assert.match(sql, /'internal_full_access',1/);
  assert.match(sql, /'Ilimitado','catalog_v1',1/);
  assert.match(sql, /'growth',null,1/);
  assert.match(sql, /'growth','catalog_v1',null/);
  assert.match(sql, /exception when check_violation/);
  assert.doesNotMatch(sql, /a5fc1411-87d5-4853-8c71-899527cc3020|55283218-7df6-4d0b-b29f-504fd6401291/);
});

test("P0-04 protege fontes financeiras e wrappers mantendo recebimento basico", async () => {
  const migration = await source("supabase/migrations/20261006172000_plan_entitlements_v1.sql");
  assert.match(migration, /create function app_private\.assert_finance_entitlement/);
  assert.match(migration, /finance_usuario_pode_gerir\(p_clinica_id\)/);
  assert.match(migration, /create policy p0_04_finance_dre on public\.finance_competencias/);
  assert.match(migration, /as restrictive for all to authenticated/);
  assert.match(migration, /'finance_pagaveis', 'finance_pagavel_parcelas', 'finance_conciliacoes'/);
  for (const name of ["finance_criar_pagavel", "finance_liquidar_pagavel", "finance_transferir", "finance_reconhecer_sessao_pacote", "finance_pagar_comissoes", "finance_conciliar_liquidacao"]) {
    assert.match(migration, new RegExp(`rename to ${name}_p004_impl`));
    assert.match(migration, new RegExp(`create function public\\.${name}\\(`));
  }
  assert.match(migration, /if p_parcelas > 1 then\s+perform app_private\.assert_finance_entitlement/);
  assert.match(migration, /return v_result - 'pagar' - 'caixa' - 'comissoes' - 'conciliacao'/);
  assert.match(migration, /revoke insert, update, delete on public\.finance_recebivel_parcelas from authenticated/);
  assert.match(migration, /create policy p0_04_receivable_package_insert on public\.finance_recebiveis/);
  assert.match(migration, /create policy p0_04_receivable_package_update on public\.finance_recebiveis/);
  assert.match(migration, /cliente_pacote_id is null or app_private\.clinic_has_entitlement\(clinica_id, 'finance_advanced'\)/);
  const service = await source("src/lib/finance/service.js");
  assert.match(service, /requireClinicCapability\("financeiro", "financeiro_avancado"\)/);
  assert.match(service, /activeClinic\.id !== clinicId/);
  assert.match(service, /supabaseAdmin\.from\("finance_competencias"\)/);
  assert.match(await source("src/app/dashboard/financeiro/receber/page.js"), /getFinanceReceiptAccounts/);
});
