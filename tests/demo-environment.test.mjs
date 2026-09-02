import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildDemoDataset,
  DEMO_DATASET_VERSION,
  DEMO_MUTABLE_TABLES,
  deterministicDemoId,
} from "../src/lib/demo/dataset.mjs";
import {
  summarizeDemoDataset,
  validateDemoDataset,
  validateDemoIdentity,
} from "../src/lib/demo/validation.mjs";

const clinicId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const expectedEmail = "demo@nexawi.com.br";
const expectedSlug = "demo-nexawi-clinicas";
const fixedNow = new Date("2026-08-29T12:00:00.000Z");

function validIdentity() {
  return {
    user: { id: userId, email: expectedEmail, app_metadata: { demo_account: true } },
    clinic: { id: clinicId, slug: expectedSlug, email: expectedEmail, metadata: { demo: true } },
    membership: { clinica_id: clinicId, user_id: userId, email: expectedEmail, ativo: true },
    expectedEmail,
    expectedSlug,
  };
}

test("identidade demo exige marcadores convergentes", () => {
  assert.equal(validateDemoIdentity(validIdentity()), true);

  for (const invalid of [
    { clinic: { ...validIdentity().clinic, slug: "clinica-real" } },
    { clinic: { ...validIdentity().clinic, metadata: { demo: false } } },
    { user: { ...validIdentity().user, app_metadata: {} } },
    { membership: { ...validIdentity().membership, ativo: false } },
    { membership: { ...validIdentity().membership, user_id: crypto.randomUUID() } },
  ]) {
    assert.throws(
      () => validateDemoIdentity({ ...validIdentity(), ...invalid }),
      { code: "DEMO_IDENTITY_INVALID" },
    );
  }
});

test("preparo da conta demo preserva sessões existentes", async () => {
  const service = await readFile(new URL("../src/lib/demo/service.js", import.meta.url), "utf8");
  const existingUserBranch = service.slice(
    service.indexOf("if (existing?.id)"),
    service.indexOf("supabaseAdmin.auth.admin.createUser"),
  );
  const createUserBranch = service.slice(service.indexOf("supabaseAdmin.auth.admin.createUser"), service.indexOf("async function ensureDemoClinic"));

  assert.doesNotMatch(existingUserBranch, /password\s*:/i);
  assert.match(createUserBranch, /password:\s*DEMO_PASSWORD/);
});

test("dataset demo e deterministico e idempotente para a mesma referencia temporal", () => {
  const first = buildDemoDataset({ clinicId, userId, now: fixedNow });
  const second = buildDemoDataset({ clinicId, userId, now: fixedNow });

  assert.deepEqual(second, first);
  assert.equal(deterministicDemoId(clinicId, "client:mariana"), first.tables.clientes[0].id);
  assert.equal(validateDemoDataset(first, { clinicId, version: DEMO_DATASET_VERSION }), true);
});

test("dataset bloqueia registro cross-tenant e IDs duplicados", () => {
  const crossTenant = buildDemoDataset({ clinicId, userId, now: fixedNow });
  crossTenant.tables.clientes[0].clinica_id = crypto.randomUUID();
  assert.throws(
    () => validateDemoDataset(crossTenant, { clinicId, version: DEMO_DATASET_VERSION }),
    /Tenant divergente/,
  );

  const duplicate = buildDemoDataset({ clinicId, userId, now: fixedNow });
  duplicate.tables.clientes[1].id = duplicate.tables.clientes[0].id;
  assert.throws(
    () => validateDemoDataset(duplicate, { clinicId, version: DEMO_DATASET_VERSION }),
    /ID duplicado/,
  );
});

test("agenda usa datas relativas e permanece visualmente rica", () => {
  const dataset = buildDemoDataset({ clinicId, userId, now: fixedNow });
  const starts = dataset.tables.agendamentos.map((item) => new Date(item.inicio));
  const reference = fixedNow.getTime();

  assert.equal(starts.length, 14);
  assert.ok(starts.some((date) => date.getTime() < reference));
  assert.ok(starts.some((date) => date.toISOString().slice(0, 10) === "2026-08-29"));
  assert.ok(starts.some((date) => date.getTime() > reference));
  assert.ok(starts.every((date) => Math.abs(date.getTime() - reference) < 8 * 86_400_000));
});

test("CRM demo usa entidades canonicas e nasce pronto para o Kanban", () => {
  const { tables } = buildDemoDataset({ clinicId, userId, now: fixedNow });
  const semanticStages = new Set(tables.crm_pipeline_stages.map((stage) => stage.semantic_key));

  for (const stage of ["new", "contacted", "qualified", "evaluation_scheduled", "negotiation", "won", "lost"]) {
    assert.ok(semanticStages.has(stage), stage);
  }
  assert.equal(tables.crm_pipelines.length, 1);
  assert.equal(tables.crm_oportunidades.length, 12);
  assert.ok(tables.crm_activities.length >= 5);
  assert.ok(tables.crm_opportunity_events.length >= 20);
  assert.ok(tables.crm_opportunity_appointments.length >= 10);
  assert.ok(tables.crm_oportunidades.every((item) => item.pipeline_id && item.stage_id));
});

test("agenda e CRM demo não possuem referências órfãs", () => {
  const dataset = buildDemoDataset({ clinicId, userId, now: fixedNow });
  const opportunityIds = new Set(dataset.tables.crm_oportunidades.map((row) => row.id));
  const appointmentIds = new Set(dataset.tables.agendamentos.map((row) => row.id));

  assert.equal(dataset.tables.crm_oportunidades.length, dataset.tables.clientes.length);
  for (const appointment of dataset.tables.agendamentos) {
    assert.ok(opportunityIds.has(appointment.crm_oportunidade_id));
  }
  for (const link of dataset.tables.crm_opportunity_appointments) {
    assert.ok(opportunityIds.has(link.opportunity_id));
    assert.ok(appointmentIds.has(link.agendamento_id));
  }

  const invalid = buildDemoDataset({ clinicId, userId, now: fixedNow });
  invalid.tables.crm_oportunidades = invalid.tables.crm_oportunidades.filter(
    (opportunity) => opportunity.id !== invalid.tables.agendamentos[0].crm_oportunidade_id,
  );
  assert.throws(
    () => validateDemoDataset(invalid, { clinicId, version: DEMO_DATASET_VERSION }),
    /Referência inválida em agendamentos\.crm_oportunidade_id/,
  );
});

test("Financeiro demo usa a fonte canonica sem duplicar pagamentos legados", () => {
  const { tables } = buildDemoDataset({ clinicId, userId, now: fixedNow });

  assert.equal(tables.pagamentos_clinica.length, 0);
  assert.ok(tables.finance_contas.length >= 3);
  assert.ok(tables.finance_recebiveis.some((item) => item.status === "pago"));
  assert.ok(tables.finance_recebiveis.some((item) => item.status === "parcial"));
  assert.ok(tables.finance_recebiveis.some((item) => item.status === "aberto"));
  assert.ok(tables.finance_pagaveis.some((item) => item.status === "pago"));
  assert.ok(tables.finance_pagaveis.some((item) => item.status === "aberto"));
  assert.ok(tables.finance_liquidacoes.length > 0);
  assert.ok(tables.finance_comissoes.length > 0);
});

test("dataset cobre todos os modulos registrados e nao deixa tabelas implicitas", () => {
  const dataset = buildDemoDataset({ clinicId, userId, now: fixedNow });
  assert.deepEqual(Object.keys(dataset.tables), DEMO_MUTABLE_TABLES);

  const counts = summarizeDemoDataset(dataset);
  assert.ok(counts.clientes >= 10);
  assert.ok(counts.profissionais >= 3);
  assert.ok(counts.procedimentos >= 5);
  assert.ok(counts.produtos_clinica >= 3);
  assert.ok(counts.pedidos_clinica >= 2);
  assert.ok(counts.eventos_analiticos >= 10);
});

test("migration restringe e serializa o reset atomico da demo", async () => {
  const [migration, automationMigration] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260829100000_demo_environment_v2.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8"),
  ]);
  const registryBlock = migration.slice(
    migration.indexOf("with registry(table_name, description)"),
    migration.indexOf("create or replace function app_private.assert_demo_service_role"),
  );
  const registeredTables = [...registryBlock.matchAll(/\('([a-z0-9_]+)',\s*'/g)].map((match) => match[1]);
  const orderingBlock = migration.slice(
    migration.indexOf("), ordering as ("),
    migration.indexOf("), numbered as ("),
  );
  const orderedTables = [...orderingBlock.matchAll(/'([a-z][a-z0-9_]+)'/g)].map((match) => match[1]);

  const automationRegistryBlock = automationMigration.slice(
    automationMigration.indexOf("insert into app_private.demo_reset_registry"),
    automationMigration.indexOf("notify pgrst"),
  );
  const automationTables = [...automationRegistryBlock
    .matchAll(/\('(automations|automation_[a-z0-9_]+)',\s*\d+,\s*'/g)]
    .map((match) => match[1]);
  const baseDatasetTables = DEMO_MUTABLE_TABLES.filter((table) => !table.startsWith("automation"));
  assert.deepEqual(registeredTables, baseDatasetTables);
  assert.deepEqual(orderedTables, baseDatasetTables);
  assert.deepEqual(automationTables, DEMO_MUTABLE_TABLES.filter((table) => table.startsWith("automation")));
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.doesNotMatch(migration, /truncate\s|drop\s+table/i);
  assert.match(migration, /request\.jwt\.claim\.role[\s\S]*service_role/i);
  assert.match(migration, /raw_app_meta_data[\s\S]*demo_account/i);
  assert.match(migration, /metadata[\s\S]*demo/i);
  assert.match(migration, /slug[\s\S]*like 'demo-%'/i);
  assert.match(migration, /usuarios_clinica[\s\S]*membership\.ativo = true/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /delete from public\.%I where clinica_id = \$1/i);
  assert.match(migration, /v_actual_count <> v_expected_count/i);
  assert.match(migration, /revoke all on function public\.reset_demo_environment_v2[\s\S]*authenticated/i);
  assert.match(migration, /grant execute on function public\.reset_demo_environment_v2[\s\S]*service_role/i);

  const identityCheck = migration.indexOf("perform app_private.validate_demo_identity_v2");
  const firstDelete = migration.indexOf("'delete from public.%I where clinica_id = $1'");
  assert.ok(identityCheck >= 0 && identityCheck < firstDelete, "a identidade deve ser validada antes do primeiro DELETE");
});
