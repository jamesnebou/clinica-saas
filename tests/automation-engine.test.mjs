import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ACTION_REGISTRY,
  ACTION_TYPES,
  getActionDefinition,
  validateActionParameters,
} from "../src/lib/automations/registry/actions.mjs";
import {
  EVENT_REGISTRY,
  EVENT_TYPES,
  getEventDefinition,
  getEventField,
} from "../src/lib/automations/registry/events.mjs";
import {
  OPERATOR_REGISTRY,
  getOperator,
  operatorSupportsType,
} from "../src/lib/automations/registry/operators.mjs";
import {
  createEmptyDefinition,
  countDefinitionNodes,
  deterministicActionKey,
  normalizeDefinition,
} from "../src/lib/automations/core.mjs";
import {
  evaluateConditionGroup,
  evaluatePredicate,
  getContextValue,
} from "../src/lib/automations/conditions.mjs";
import { dryRunAutomation } from "../src/lib/automations/compiler.mjs";
import { validateAutomationDefinition } from "../src/lib/automations/validation.mjs";
import { evaluateLoopGuard, buildCausationMetadata } from "../src/lib/automations/loop-guard.mjs";
import { DEFAULT_AUTOMATION_LIMITS, resolveAutomationLimits } from "../src/lib/automations/limits.mjs";
import { AUTOMATION_TEMPLATES } from "../src/lib/automations/templates.mjs";
import { assertAutomationOperation, canPerformAutomationOperation } from "../src/lib/automations/permissions.mjs";
import { calculateWaitResumeAt, zonedLocalToUtc } from "../src/lib/automations/time.mjs";
import { buildDemoDataset } from "../src/lib/demo/dataset.mjs";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

const predicate = (field, operator, value, valueType = "string") => ({
  kind: "predicate", field, operator, value, valueType,
});
const group = (conditions = [], operator = "AND") => ({ kind: "group", operator, conditions });
const action = (id = "action_1", actionType = "internal.create_notification", params = { title: "Aviso", message: "Mensagem" }) => ({ id, type: "action", actionType, params });
const definition = (overrides = {}) => ({
  schemaVersion: 1,
  trigger: { type: "crm.opportunity.created", reentry: "deny_self" },
  conditions: group(),
  steps: [action()],
  ...overrides,
});

test("Event Registry lista apenas eventos canônicos", () => {
  assert.ok(EVENT_TYPES.length >= 10);
  assert.deepEqual(EVENT_TYPES, Object.keys(EVENT_REGISTRY));
});

test("Event Registry reconhece oportunidade criada", () => {
  assert.equal(getEventDefinition("crm.opportunity.created")?.entity, "crm_opportunity");
});

test("Event Registry reconhece eventos reais da Agenda", () => {
  assert.ok(["booking.created", "booking.rescheduled", "booking.cancelled", "booking.completed", "booking.no_show"].every((type) => EVENT_TYPES.includes(type)));
});

test("Event Registry reconhece eventos reais do Financeiro", () => {
  assert.ok(["finance.receivable.created", "finance.receivable.due_soon", "finance.receivable.overdue", "payment.received", "payment.partial"].every((type) => EVENT_TYPES.includes(type)));
});

test("Event Registry restringe os campos de condição", () => {
  assert.equal(getEventField("crm.opportunity.created", "opportunity.valor_estimado")?.type, "money");
  assert.equal(getEventField("crm.opportunity.created", "client.cpf"), null);
});

test("Event Registry rejeita string arbitrária", () => {
  assert.equal(getEventDefinition("custom.execute_sql"), null);
});

test("Action Registry lista ações previamente registradas", () => {
  assert.ok(ACTION_TYPES.length >= 10);
  assert.deepEqual(ACTION_TYPES, Object.keys(ACTION_REGISTRY));
});

test("Action Registry declara executor, risco e idempotência", () => {
  const item = getActionDefinition("crm.create_activity");
  assert.equal(item.executor, "crm.create_activity");
  assert.equal(item.risk, "LOW");
  assert.equal(item.idempotency, "run_step");
});

test("Action Registry rejeita ação desconhecida", () => {
  assert.match(validateActionParameters("system.eval", {})[0], /não registrada/i);
});

test("Action Registry valida parâmetro obrigatório", () => {
  assert.ok(validateActionParameters("internal.create_notification", {}).length >= 2);
  assert.deepEqual(validateActionParameters("internal.create_notification", { title: "A", message: "B" }), []);
});

test("Operator Registry possui o conjunto seguro mínimo", () => {
  for (const name of ["equals", "not_equals", "in", "not_in", "contains", "not_contains", "greater_than", "greater_or_equal", "less_than", "less_or_equal", "is_empty", "is_not_empty", "before", "after", "between"]) assert.ok(getOperator(name), name);
});

test("Operator Registry bloqueia combinação de tipo incompatível", () => {
  assert.equal(operatorSupportsType("contains", "money"), false);
  assert.equal(operatorSupportsType("greater_than", "money"), true);
  assert.equal(Object.keys(OPERATOR_REGISTRY).includes("eval"), false);
});

test("Context path não permite prototype pollution", () => {
  assert.equal(getContextValue({ safe: { value: 1 } }, "safe.value"), 1);
  assert.equal(getContextValue({}, "__proto__.polluted"), undefined);
  assert.equal(getContextValue({}, "constructor.prototype"), undefined);
});

test("Condition Engine avalia equals", () => {
  assert.equal(evaluatePredicate(predicate("opportunity.status", "equals", "aberta"), { opportunity: { status: "aberta" } }), true);
});

test("Condition Engine avalia not_equals", () => {
  assert.equal(evaluatePredicate(predicate("opportunity.status", "not_equals", "perdida"), { opportunity: { status: "aberta" } }), true);
});

test("Condition Engine avalia in e not_in", () => {
  const context = { opportunity: { status: "aberta" } };
  assert.equal(evaluatePredicate(predicate("opportunity.status", "in", ["aberta", "ganha"], "enum"), context), true);
  assert.equal(evaluatePredicate(predicate("opportunity.status", "not_in", ["perdida"], "enum"), context), true);
});

test("Condition Engine avalia contains sem diferenciar maiúsculas", () => {
  assert.equal(evaluatePredicate(predicate("opportunity.title", "contains", "CLÍNICA"), { opportunity: { title: "Nova clínica" } }), true);
});

test("Condition Engine avalia comparação numérica", () => {
  assert.equal(evaluatePredicate(predicate("opportunity.score", "greater_or_equal", 50, "number"), { opportunity: { score: "70" } }), true);
  assert.equal(evaluatePredicate(predicate("opportunity.score", "less_than", 80, "number"), { opportunity: { score: 70 } }), true);
});

test("Condition Engine avalia dinheiro como número", () => {
  assert.equal(evaluatePredicate(predicate("opportunity.valor_estimado", "greater_than", 1000, "money"), { opportunity: { valor_estimado: "1250.50" } }), true);
});

test("Condition Engine avalia before e after", () => {
  const context = { booking: { inicio: "2026-09-01T12:00:00Z" } };
  assert.equal(evaluatePredicate(predicate("booking.inicio", "before", "2026-09-02T12:00:00Z", "datetime"), context), true);
  assert.equal(evaluatePredicate(predicate("booking.inicio", "after", "2026-08-31T12:00:00Z", "datetime"), context), true);
});

test("Condition Engine avalia between inclusivo", () => {
  assert.equal(evaluatePredicate(predicate("opportunity.score", "between", [20, 30], "number"), { opportunity: { score: 20 } }), true);
});

test("Condition Engine avalia null e vazio", () => {
  assert.equal(evaluatePredicate(predicate("opportunity.responsavel_id", "is_empty", null, "reference"), { opportunity: { responsavel_id: null } }), true);
  assert.equal(evaluatePredicate(predicate("opportunity.responsavel_id", "is_not_empty", null, "reference"), { opportunity: { responsavel_id: UUID_A } }), true);
});

test("Condition Engine combina AND", () => {
  const conditions = group([predicate("a", "equals", 1, "number"), predicate("b", "equals", 2, "number")]);
  assert.equal(evaluateConditionGroup(conditions, { a: 1, b: 2 }), true);
  assert.equal(evaluateConditionGroup(conditions, { a: 1, b: 3 }), false);
});

test("Condition Engine combina OR", () => {
  const conditions = group([predicate("a", "equals", 1, "number"), predicate("b", "equals", 2, "number")], "OR");
  assert.equal(evaluateConditionGroup(conditions, { a: 0, b: 2 }), true);
});

test("Condition Engine suporta grupos aninhados", () => {
  const conditions = group([predicate("a", "equals", 1, "number"), group([predicate("b", "equals", 2, "number"), predicate("c", "equals", 3, "number")], "OR")]);
  assert.equal(evaluateConditionGroup(conditions, { a: 1, b: 0, c: 3 }), true);
});

test("Grupo vazio é condição verdadeira", () => {
  assert.equal(evaluateConditionGroup(group(), {}), true);
});

test("Definição vazia possui schema versionado", () => {
  const empty = createEmptyDefinition("booking.created");
  assert.equal(empty.schemaVersion, 1);
  assert.equal(empty.trigger.type, "booking.created");
});

test("Normalização não preserva propriedades arbitrárias", () => {
  const normalized = normalizeDefinition({ ...definition(), sql: "drop table", trigger: { type: "crm.opportunity.created", arbitrary: true } });
  assert.equal(normalized.sql, undefined);
  assert.equal(normalized.trigger.arbitrary, undefined);
});

test("Contagem inclui steps, waits, condições e profundidade", () => {
  const counts = countDefinitionNodes(definition({
    conditions: group([predicate("opportunity.score", "greater_than", 10, "number")]),
    steps: [{ id: "wait", type: "wait", mode: "duration", amount: 1, unit: "hours" }, { id: "branch", type: "branch", conditions: group([predicate("opportunity.status", "equals", "aberta", "enum")]), then: [action("nested")], else: [] }],
  }));
  assert.deepEqual(counts, { steps: 3, waits: 1, conditions: 2, maxConditionDepth: 1 });
});

test("Idempotency key é determinística por run e step", () => {
  assert.equal(deterministicActionKey(UUID_A, "send"), deterministicActionKey(UUID_A, "send"));
  assert.notEqual(deterministicActionKey(UUID_A, "send"), deterministicActionKey(UUID_A, "other"));
});

test("Publish validation aceita definição registrada", () => {
  assert.equal(validateAutomationDefinition(definition(), { capabilities: ["crm", "automacoes"] }).valid, true);
});

test("Publish validation rejeita trigger inexistente", () => {
  const result = validateAutomationDefinition(definition({ trigger: { type: "unknown.event" } }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /evento registrado/i);
});

test("Publish validation rejeita action inexistente", () => {
  const result = validateAutomationDefinition(definition({ steps: [action("bad", "unknown.action", {})] }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /não registrada/i);
});

test("Publish validation rejeita parâmetro obrigatório ausente", () => {
  const result = validateAutomationDefinition(definition({ steps: [action("notify", "internal.create_notification", { title: "Aviso" })] }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /mensagem/i);
});

test("Publish validation rejeita referência fora do formato UUID", () => {
  const result = validateAutomationDefinition(definition({ steps: [action("move", "crm.move_stage", { stage_id: "Negociação" })] }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /UUID/i);
});

test("Publish validation aceita referência UUID", () => {
  const result = validateAutomationDefinition(definition({ steps: [action("move", "crm.move_stage", { stage_id: UUID_A })] }), { capabilities: ["crm"] });
  assert.equal(result.valid, true);
});

test("Publish validation aplica capability do trigger", () => {
  const result = validateAutomationDefinition(definition(), { capabilities: ["automacoes"] });
  assert.match(result.errors.join(" "), /capability crm/i);
});

test("Publish validation aplica capability da ação", () => {
  const result = validateAutomationDefinition(definition(), { capabilities: ["crm"] });
  assert.match(result.errors.join(" "), /capability automacoes/i);
});

test("Publish validation limita steps", () => {
  const result = validateAutomationDefinition(definition({ steps: [action("a"), action("b")] }), { limits: { maxSteps: 1 } });
  assert.match(result.errors.join(" "), /etapas excedido/i);
});

test("Publish validation limita waits", () => {
  const wait = { id: "wait", type: "wait", mode: "duration", amount: 1, unit: "hours" };
  const result = validateAutomationDefinition(definition({ steps: [wait, action()] }), { limits: { maxWaits: 0 } });
  assert.match(result.errors.join(" "), /esperas excedido/i);
});

test("Publish validation limita quantidade de condições", () => {
  const result = validateAutomationDefinition(definition({ conditions: group([predicate("opportunity.score", "greater_than", 1, "number"), predicate("opportunity.score", "less_than", 10, "number")]) }), { limits: { maxConditions: 1 } });
  assert.match(result.errors.join(" "), /condições excedido/i);
});

test("Publish validation limita profundidade de condições", () => {
  const nested = group([group([group([predicate("opportunity.score", "equals", 1, "number")])])]);
  const result = validateAutomationDefinition(definition({ conditions: nested }), { limits: { maxConditionDepth: 2 } });
  assert.match(result.errors.join(" "), /Profundidade máxima/i);
});

test("Publish validation rejeita IDs de step duplicados inclusive em branch", () => {
  const branch = { id: "branch", type: "branch", conditions: group(), then: [action("duplicate")], else: [action("duplicate")] };
  const result = validateAutomationDefinition(definition({ steps: [branch] }));
  assert.match(result.errors.join(" "), /duplicado/i);
});

test("Publish validation rejeita JSON inválido", () => {
  assert.equal(validateAutomationDefinition("{").valid, false);
});

test("Dry-run não executa quando trigger conditions falham", () => {
  const input = definition({ conditions: group([predicate("opportunity.score", "greater_than", 50, "number")]) });
  const result = dryRunAutomation(input, { opportunity: { score: 10 } });
  assert.equal(result.matched, false);
  assert.equal(result.timeline.some((item) => item.type === "action"), false);
});

test("Dry-run percorre action sem efeito colateral", () => {
  const result = dryRunAutomation(definition(), { opportunity: {} });
  assert.equal(result.matched, true);
  assert.equal(result.timeline.at(-1).status, "skipped");
  assert.match(result.timeline.at(-1).message, /sem efeitos colaterais/i);
});

test("Dry-run registra wait sem aguardar", () => {
  const result = dryRunAutomation(definition({ steps: [{ id: "wait", type: "wait", mode: "duration", amount: 2, unit: "hours" }, action()] }), { opportunity: {} });
  assert.equal(result.timeline.find((item) => item.type === "wait")?.status, "skipped");
});

test("Dry-run escolhe o ramo correto", () => {
  const branch = { id: "branch", type: "branch", conditions: group([predicate("opportunity.score", "greater_than", 50, "number")]), then: [action("yes")], else: [action("no")] };
  const result = dryRunAutomation(definition({ steps: [branch] }), { opportunity: { score: 80 } });
  assert.match(result.timeline.find((item) => item.type === "branch")?.message, /verdadeiro/i);
  assert.equal(result.timeline.some((item) => item.stepId === "yes"), true);
  assert.equal(result.timeline.some((item) => item.stepId === "no"), false);
});

test("Loop guard bloqueia reentrada da mesma automação", () => {
  assert.equal(evaluateLoopGuard({ event: { automation_id: UUID_A }, automationId: UUID_A }).code, "SELF_REENTRY_BLOCKED");
});

test("Loop guard permite reentrada explícita", () => {
  assert.equal(evaluateLoopGuard({ event: { automation_id: UUID_A }, automationId: UUID_A, reentry: "allow" }).allowed, true);
});

test("Loop guard bloqueia profundidade máxima", () => {
  const result = evaluateLoopGuard({ event: { automation_depth: 5 }, automationId: UUID_A, limits: { ...DEFAULT_AUTOMATION_LIMITS, maxAutomationDepth: 5 } });
  assert.equal(result.code, "MAX_AUTOMATION_DEPTH");
});

test("Metadados de causação preservam correlação", () => {
  const metadata = buildCausationMetadata({ event: { id: UUID_A, correlation_id: "corr" }, automationId: UUID_B, runId: UUID_A, depth: 2 });
  assert.deepEqual(metadata, { correlation_id: "corr", causation_id: UUID_A, automation_id: UUID_B, automation_run_id: UUID_A, automation_depth: 2 });
});

test("Wait duration calcula retomada sem processo aberto", () => {
  assert.equal(calculateWaitResumeAt({ mode: "duration", amount: 2, unit: "hours" }, { now: "2026-08-30T10:00:00.000Z" }), "2026-08-30T12:00:00.000Z");
});

test("Wait until converte horário local da clínica para UTC", () => {
  assert.equal(zonedLocalToUtc("2026-08-30T09:00", "America/Bahia"), "2026-08-30T12:00:00.000Z");
});

test("Wait until preserva timestamp absoluto", () => {
  assert.equal(calculateWaitResumeAt({ mode: "until", until: "2026-08-30T09:00:00-03:00" }), "2026-08-30T12:00:00.000Z");
});

test("Wait rejeita duração inválida", () => {
  assert.throws(() => calculateWaitResumeAt({ mode: "duration", amount: 0, unit: "hours" }), /inválida/i);
});

test("Limites aceitam override controlado", () => {
  const limits = resolveAutomationLimits({ automation_limits: { maxSteps: 12, maxAttempts: 3 } });
  assert.equal(limits.maxSteps, 12);
  assert.equal(limits.maxAttempts, 3);
});

test("Limites são truncados aos tetos de segurança", () => {
  const limits = resolveAutomationLimits({ automation_limits: { maxSteps: 9999, maxAutomationDepth: 999 } });
  assert.equal(limits.maxSteps, 100);
  assert.equal(limits.maxAutomationDepth, 10);
});

test("Owner possui operações granulares de automação", () => {
  assert.ok(["view", "manage", "publish", "runs", "export"].every((operation) => canPerformAutomationOperation("owner", operation)));
});

test("Recepção não pode publicar automação", () => {
  assert.equal(canPerformAutomationOperation("recepcao", "publish"), false);
  assert.throws(() => assertAutomationOperation("recepcao", "publish"), { code: "AUTOMATION_PERMISSION_DENIED" });
});

test("Operação arbitrária é negada", () => {
  assert.equal(canPerformAutomationOperation("owner", "execute_sql"), false);
});

test("Galeria inicial contém oito modelos inativos por definição", () => {
  assert.equal(AUTOMATION_TEMPLATES.length, 8);
  assert.equal(AUTOMATION_TEMPLATES.every((item) => item.definition && !item.active), true);
});

test("Contexto autorizado de seção disponibiliza o cliente Supabase às actions", async () => {
  const source = await readFile(new URL("../src/lib/auth/session.js", import.meta.url), "utf8");
  assert.match(source, /const supabase = await createClient\(\);[\s\S]*return \{ \.\.\.context, supabase \};/);
  assert.doesNotMatch(source, /if \(!activeClinic\) \{\s*return context;/);
});

test("Builder mantém margens e controles responsivos", async () => {
  const [page, builder] = await Promise.all([
    readFile(new URL("../src/app/dashboard/automacoes/[id]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/automations/automation-builder.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10/);
  assert.match(page, /max-w-\[1680px\]/);
  assert.match(page, /overflow-x-auto/);
  assert.match(builder, /min-w-0 max-w-full/);
  assert.match(builder, /flex min-w-0 flex-wrap items-center/);
  assert.match(builder, /flex flex-col-reverse gap-3 sm:flex-row/);
});

test("Todos os templates usam triggers registrados", () => {
  assert.equal(AUTOMATION_TEMPLATES.every((item) => EVENT_TYPES.includes(item.definition.trigger.type)), true);
});

test("Migration cria as tabelas centrais do motor", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8");
  for (const table of ["automations", "automation_versions", "automation_runs", "automation_run_steps", "automation_waits", "automation_event_consumptions", "automation_action_receipts", "automation_tasks"]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
});

test("Migration fixa execução à versão imutável", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8");
  assert.match(sql, /foreign key \(clinica_id,automation_version_id\)[\s\S]*on delete restrict/i);
  assert.match(sql, /unique \(automation_id,version\)/i);
});

test("Migration impede run duplicado para o mesmo evento", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8");
  assert.match(sql, /automation_runs_once_per_event_idx[\s\S]*clinica_id,automation_version_id,source_event_id/i);
});

test("Migration usa claim concorrente com SKIP LOCKED", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8");
  assert.match(sql, /claim_automation_waits[\s\S]*for update skip locked/i);
  assert.match(sql, /claim_automation_runs[\s\S]*for update skip locked/i);
});

test("Migration protege todas as tabelas com RLS tenant-safe", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /automation_has_access\(clinica_id,false\)/i);
  assert.doesNotMatch(sql, /auth\.uid\(\)\s+is\s+null/i);
});

test("Migration rejeita referências cross-tenant por chave composta", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8");
  assert.match(sql, /foreign key \(clinica_id,run_id\) references public\.automation_runs\(clinica_id,id\)/i);
  assert.match(sql, /foreign key \(clinica_id,automation_id\) references public\.automations\(clinica_id,id\)/i);
});

test("Migration usa domain outbox como fila transacional", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8");
  assert.match(sql, /domain_outbox_events/i);
  assert.match(sql, /consumer[\s\S]*values\([\s\S]*'automation'/i);
  assert.doesNotMatch(sql, /eventos_analiticos[\s\S]*(claim|for update skip locked)/i);
});

test("Migration registra idempotência de ações e tarefas", async () => {
  const [base, hardening] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260830110000_automation_engine_v2_hardening.sql", import.meta.url), "utf8"),
  ]);
  assert.match(base, /idempotency_key text not null unique/i);
  assert.match(`${base}\n${hardening}`, /automation_tasks_idempotency_uidx/i);
});

test("Migration registra somente tabelas ausentes da demo sem reutilizar ordens globais", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8");
  assert.match(sql, /lock table app_private\.demo_reset_registry in exclusive mode/i);
  assert.match(sql, /coalesce\(max\(delete_order\), 0\) \+ 100/i);
  assert.match(sql, /coalesce\(max\(insert_order\), 0\) \+ 100/i);
  assert.match(sql, /where not exists[\s\S]*existing\.table_name = registry\.table_name/i);
  assert.doesNotMatch(sql, /delete from app_private\.demo_reset_registry/i);
  assert.doesNotMatch(sql, /\('automation_runs',\s*10,\s*90/i);
});

test("Migration não recria triggers nem políticas que já existem", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8");
  assert.match(sql, /if not exists \([\s\S]*pg_trigger[\s\S]*automation_booking_event_trigger/i);
  assert.match(sql, /if not exists \([\s\S]*pg_trigger[\s\S]*automation_receivable_event_trigger/i);
  assert.match(sql, /if not exists \([\s\S]*pg_policies[\s\S]*members_select/i);
  assert.doesNotMatch(sql, /drop trigger if exists automation_(booking|receivable)_event_trigger/i);
});

test("Hardening recupera instalações legadas sem automation_tasks", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830110000_automation_engine_v2_hardening.sql", import.meta.url), "utf8");
  const createPosition = sql.indexOf("create table if not exists public.automation_tasks");
  const indexPosition = sql.indexOf("create unique index if not exists automation_tasks_idempotency_uidx");
  assert.ok(createPosition >= 0, "a tabela de tarefas deve ser criada pelo fix-forward");
  assert.ok(indexPosition > createPosition, "o índice só pode ser criado depois da tabela");
});

test("Hardening corrige integridade tenant e RLS sem sessão anônima privilegiada", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830110000_automation_engine_v2_hardening.sql", import.meta.url), "utf8");
  assert.match(sql, /foreign key \(clinica_id,run_id\)[\s\S]*references public\.automation_runs\(clinica_id,id\)/i);
  assert.match(sql, /automation_tasks_members_select[\s\S]*automation_has_access\(clinica_id,false\)/i);
  assert.doesNotMatch(sql, /auth\.uid\(\)\s+is\s+null/i);
});

test("Hardening usa apenas status válidos e valor total do Financeiro 2.0", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830110000_automation_engine_v2_hardening.sql", import.meta.url), "utf8");
  assert.match(sql, /status in \('aberto','parcial'\)/i);
  assert.doesNotMatch(sql, /status in \([^)]*'vencido'/i);
  assert.match(sql, /'valor_total',new\.valor_total/i);
});

test("Hardening recarrega o schema REST após recuperar tabelas", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830110000_automation_engine_v2_hardening.sql", import.meta.url), "utf8");
  assert.match(sql, /notify\s+pgrst\s*,\s*'reload schema'/i);
});

test("Migration permite cancelamento definitivo de wait", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8");
  assert.match(sql, /cancel_automation_run[\s\S]*automation_waits set status='cancelled'/i);
});

test("Migration publica versão dentro de transação e auditoria", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260830100000_automation_engine_v2.sql", import.meta.url), "utf8");
  assert.match(sql, /publish_automation_v2/i);
  assert.match(sql, /automation\.published/i);
  assert.match(sql, /^begin;/i);
  assert.match(sql, /commit;\s*$/i);
});

test("Demo 2.0 inclui automações pausadas e histórico coerente", () => {
  const dataset = buildDemoDataset({ clinicId: UUID_A, userId: UUID_B, now: new Date("2026-08-30T12:00:00.000Z") });
  assert.ok(dataset.tables.automations.length >= 3);
  assert.equal(dataset.tables.automations.every((item) => item.status === "paused"), true);
  assert.ok(dataset.tables.automation_versions.length >= 3);
  assert.ok(dataset.tables.automation_runs.length >= 1);
  assert.ok(dataset.tables.automation_run_steps.length >= 1);
});
