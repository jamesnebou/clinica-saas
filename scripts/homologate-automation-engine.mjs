import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { processAutomationOutboxEvent, continueAutomationRun, resumeAutomationWait } from "../src/lib/automations/engine.js";

const CONFIRMATION = "demo-isolado";
const DEMO_SLUG = process.env.DEMO_CLINIC_SLUG || "demo-nexawi-clinicas";
const token = `homologation:${new Date().toISOString()}:${randomUUID()}`;
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (process.env.AUTOMATION_HOMOLOGATION_CONFIRM !== CONFIRMATION) {
  throw new Error(`Execucao bloqueada. Defina AUTOMATION_HOMOLOGATION_CONFIRM=${CONFIRMATION}.`);
}
if (!url || !key) throw new Error("Supabase server-side nao configurado.");
process.env.AUTOMATION_ALLOW_HIGH_RISK_ACTIONS = "false";

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const tracked = { automations: [], opportunities: [], clients: [], events: [], runs: [], activities: [] };
const results = [];

const group = (conditions = []) => ({ kind: "group", operator: "AND", conditions });
const predicate = (field, operator, value, valueType = "string") => ({ kind: "predicate", field, operator, value, valueType });
const definition = (triggerType, steps, conditions = [], reentry = "deny_self") => ({
  schemaVersion: 1,
  trigger: { type: triggerType, reentry },
  conditions: group(conditions),
  steps,
});
const assert = (value, message) => { if (!value) throw new Error(message); return value; };
const safeError = (error) => ({ code: error?.code || "ERROR", message: String(error?.message || error).slice(0, 500) });

async function one(query, label = "registro") {
  const { data, error } = await query;
  if (error) throw error;
  return assert(data, `${label} nao encontrado.`);
}

async function record(name, execute) {
  try {
    results.push({ name, status: "PASS", evidence: await execute() });
  } catch (error) {
    results.push({ name, status: "FAIL", error: safeError(error) });
  } finally {
    if (tracked.automations.length) await db.from("automations").update({ status: "paused" }).in("id", tracked.automations);
  }
}

async function createAutomation(clinicId, triggerType, name, body) {
  const automation = await one(db.from("automations").insert({
    clinica_id: clinicId,
    name: `${name} [${token}]`,
    status: "active",
    trigger_type: triggerType,
    draft_definition: body,
    metadata: { homologation: true, token },
  }).select("*").single(), "automacao");
  tracked.automations.push(automation.id);
  const version = await one(db.from("automation_versions").insert({
    clinica_id: clinicId,
    automation_id: automation.id,
    version: 1,
    trigger_type: triggerType,
    definition: body,
    definition_hash: randomUUID(),
    status: "active",
  }).select("*").single(), "versao");
  await one(db.from("automations").update({ current_version_id: version.id, published_at: new Date().toISOString() }).eq("id", automation.id).select("*").single(), "publicacao");
  return automation;
}

async function createEvent(clinicId, type, aggregateType, aggregateId, options = {}) {
  const event = await one(db.from("domain_outbox_events").insert({
    clinica_id: clinicId,
    event_name: type,
    aggregate_type: aggregateType,
    aggregate_id: aggregateId,
    payload: { homologation: true, token, ...(options.payload || {}) },
    idempotency_key: `${token}:${type}:${randomUUID()}`,
    consumer: "automation",
    status: "pending",
    available_at: new Date().toISOString(),
    correlation_id: options.correlation_id || token,
    causation_id: options.causation_id || null,
    automation_run_id: options.automation_run_id || null,
    automation_depth: Number(options.automation_depth || 0),
  }).select("*").single(), "evento");
  tracked.events.push(event.id);
  return event;
}

async function startAndExecute(event, automationId) {
  await processAutomationOutboxEvent(event);
  const run = await one(db.from("automation_runs").select("*").eq("source_event_id", event.id).eq("automation_id", automationId).single(), "run");
  tracked.runs.push(run.id);
  await one(db.from("automation_runs").update({ status: "running", attempts: 1, started_at: new Date().toISOString() }).eq("id", run.id).select("*").single(), "claim isolado do run");
  await continueAutomationRun(run.id);
  return one(db.from("automation_runs").select("*").eq("id", run.id).single(), "run final");
}

async function receipt(runId, stepId) {
  return one(db.from("automation_action_receipts").select("*").eq("run_id", runId).eq("step_id", stepId).single(), "receipt");
}

async function createOpportunity(clinicId, clientId, pipelineId, stageId) {
  const { data, error } = await db.rpc("crm_create_opportunity", {
    p_clinica_id: clinicId,
    p_cliente_id: clientId,
    p_nome: `Lead [${token}]`,
    p_titulo: "Homologacao Automation 2.0",
    p_telefone: null,
    p_email: process.env.AUTOMATION_HOMOLOGATION_EMAIL || null,
    p_origem: "outro",
    p_valor: 100,
    p_pipeline_id: pipelineId,
    p_stage_id: stageId,
    p_procedimento_id: null,
    p_responsavel_id: null,
    p_temperatura: "morno",
    p_score: 50,
    p_observacoes: token,
    p_attribution: { source: "homologation" },
    p_identificador_externo: `${token}:${randomUUID()}`,
  });
  if (error) throw error;
  tracked.opportunities.push(data.id);
  return data;
}

async function cleanup(clinicId) {
  if (!clinicId) return;
  const unique = (items) => [...new Set(items.filter(Boolean))];
  if (tracked.opportunities.length) {
    const generated = await db.from("domain_outbox_events").select("id").eq("clinica_id", clinicId).in("aggregate_id", unique(tracked.opportunities));
    tracked.events.push(...(generated.data || []).map((item) => item.id));
  }
  const runIds = unique(tracked.runs);
  const eventIds = unique(tracked.events);
  if (runIds.length) await db.from("automation_action_receipts").delete().in("run_id", runIds);
  if (runIds.length) await db.from("automation_tasks").delete().in("run_id", runIds);
  if (runIds.length) await db.from("automation_waits").delete().in("run_id", runIds);
  if (runIds.length) await db.from("automation_run_steps").delete().in("run_id", runIds);
  if (eventIds.length) await db.from("automation_event_consumptions").delete().in("source_event_id", eventIds);
  if (runIds.length) await db.from("automation_runs").delete().in("id", runIds);
  if (tracked.activities.length) await db.from("crm_activities").delete().in("id", unique(tracked.activities));
  if (eventIds.length) await db.from("domain_outbox_events").delete().in("id", eventIds);
  if (tracked.automations.length) await db.from("automations").delete().in("id", unique(tracked.automations));
  if (tracked.opportunities.length) await db.from("crm_oportunidades").delete().in("id", unique(tracked.opportunities));
  if (tracked.clients.length) await db.from("clientes").delete().in("id", unique(tracked.clients));
}

let clinicId;
try {
  const clinic = await one(db.from("clinicas").select("id,slug,metadata").eq("slug", DEMO_SLUG).single(), "clinica demo");
  clinicId = clinic.id;
  assert(clinic.metadata?.demo === true, "A clinica encontrada nao esta marcada como demo.");
  const pipeline = await one(db.from("crm_pipelines").select("id").eq("clinica_id", clinicId).eq("ativo", true).order("padrao", { ascending: false }).limit(1).single(), "pipeline demo");
  const initialStage = await one(db.from("crm_pipeline_stages").select("id").eq("clinica_id", clinicId).eq("pipeline_id", pipeline.id).eq("ativo", true).eq("semantic_key", "new").limit(1).single(), "etapa inicial demo");
  const client = await one(db.from("clientes").insert({
    clinica_id: clinicId,
    nome: `Cliente [${token}]`,
    email: process.env.AUTOMATION_HOMOLOGATION_EMAIL || null,
    status: "lead",
    consentimento_lgpd: true,
  }).select("*").single(), "cliente temporario");
  tracked.clients.push(client.id);
  const opportunity = await createOpportunity(clinicId, client.id, pipeline.id, initialStage.id);

  await record("CRM event -> condition -> activity -> receipt -> completed", async () => {
    const body = definition("crm.opportunity.created", [
      { id: "condition_true", type: "condition", conditions: group([predicate("opportunity.id", "equals", opportunity.id, "reference")]) },
      { id: "activity", type: "action", actionType: "crm.create_activity", params: { title: `Follow-up [${token}]`, activity_type: "tarefa", due_in_minutes: 0 } },
    ]);
    const automation = await createAutomation(clinicId, "crm.opportunity.created", "CRM real", body);
    const event = await createEvent(clinicId, "crm.opportunity.created", "crm_opportunity", opportunity.id);
    const run = await startAndExecute(event, automation.id);
    assert(run.status === "completed", `Run CRM terminou como ${run.status}.`);
    const actionReceipt = await receipt(run.id, "activity");
    assert(actionReceipt.status === "completed", "Receipt CRM nao concluido.");
    tracked.activities.push(actionReceipt.entity_id);
    const lineage = await one(db.from("domain_outbox_events").select("correlation_id,causation_id,automation_run_id,automation_depth").eq("clinica_id", clinicId).eq("event_name", "crm.activity.created").eq("aggregate_id", opportunity.id).contains("payload", { activity_id: actionReceipt.entity_id }).order("created_at", { ascending: false }).limit(1).single(), "linhagem CRM");
    assert(lineage.automation_run_id === run.id && Number(lineage.automation_depth) >= 1, "Linhagem da acao CRM ausente.");
    await processAutomationOutboxEvent(event);
    const duplicate = await db.from("automation_runs").select("id", { count: "exact", head: true }).eq("source_event_id", event.id).eq("automation_id", automation.id);
    assert(duplicate.count === 1, "Evento duplicado criou run adicional.");
    return { runId: run.id, activityId: actionReceipt.entity_id, receiptId: actionReceipt.id, duplicateRuns: duplicate.count };
  });

  await record("Wait -> resume persistente", async () => {
    const body = definition("crm.opportunity.created", [
      { id: "wait", type: "wait", mode: "duration", amount: 1, unit: "minutes" },
      { id: "after_wait", type: "action", actionType: "internal.create_notification", params: { title: "Wait retomado", message: token } },
    ]);
    const automation = await createAutomation(clinicId, "crm.opportunity.created", "Wait real", body);
    const event = await createEvent(clinicId, "crm.opportunity.created", "crm_opportunity", opportunity.id);
    const waiting = await startAndExecute(event, automation.id);
    assert(waiting.status === "waiting", `Run nao entrou em waiting: ${waiting.status}.`);
    const wait = await one(db.from("automation_waits").select("*").eq("run_id", waiting.id).single(), "wait");
    assert(Date.parse(wait.resume_at) > Date.now(), "resume_at nao ficou no futuro.");
    const premature = await db.from("automation_waits").select("id").eq("id", wait.id).eq("status", "pending").lte("resume_at", new Date().toISOString());
    assert((premature.data || []).length === 0, "Wait ficou elegivel antes de resume_at.");
    await db.from("automation_waits").update({ resume_at: new Date(Date.now() - 1000).toISOString() }).eq("id", wait.id);
    const claimed = await one(db.from("automation_waits").update({ status: "processing", attempts: 1, locked_at: new Date().toISOString(), locked_by: token }).eq("id", wait.id).eq("status", "pending").lte("resume_at", new Date().toISOString()).select("*").single(), "claim isolado do wait");
    const resumed = await resumeAutomationWait(claimed);
    assert(resumed.status === "completed", `Run retomado terminou como ${resumed.status}.`);
    return { runId: waiting.id, waitId: wait.id, resumeAt: wait.resume_at };
  });

  await record("Post-wait revalidation", async () => {
    const current = await one(db.from("crm_oportunidades").select("stage_id,pipeline_id").eq("id", opportunity.id).single(), "etapa original");
    const alternate = await one(db.from("crm_pipeline_stages").select("id").eq("clinica_id", clinicId).eq("pipeline_id", current.pipeline_id).neq("id", current.stage_id).eq("ativo", true).limit(1).single(), "etapa alternativa");
    const body = definition("crm.opportunity.created", [
      { id: "wait", type: "wait", mode: "duration", amount: 1, unit: "minutes" },
      { id: "still_stage", type: "condition", conditions: group([predicate("opportunity.stage_id", "equals", current.stage_id, "reference")]) },
      { id: "must_not_run", type: "action", actionType: "internal.create_notification", params: { title: "Nao executar", message: token } },
    ]);
    const automation = await createAutomation(clinicId, "crm.opportunity.created", "Revalidacao real", body);
    const event = await createEvent(clinicId, "crm.opportunity.created", "crm_opportunity", opportunity.id);
    const waiting = await startAndExecute(event, automation.id);
    const wait = await one(db.from("automation_waits").select("*").eq("run_id", waiting.id).single(), "wait revalidacao");
    let resumed;
    await db.from("crm_oportunidades").update({ stage_id: alternate.id }).eq("id", opportunity.id);
    try {
      await db.from("automation_waits").update({ status: "processing", resume_at: new Date(Date.now() - 1000).toISOString() }).eq("id", wait.id);
      resumed = await resumeAutomationWait({ ...wait, status: "processing" });
    } finally {
      await db.from("crm_oportunidades").update({ stage_id: current.stage_id }).eq("id", opportunity.id);
    }
    assert(resumed.status === "skipped", `Revalidacao terminou como ${resumed.status}.`);
    const actionCount = await db.from("automation_action_receipts").select("id", { count: "exact", head: true }).eq("run_id", waiting.id).eq("step_id", "must_not_run");
    assert(actionCount.count === 0, "Acao ocorreu com condicao pos-wait falsa.");
    return { runId: waiting.id, changedStage: alternate.id, actionReceipts: actionCount.count };
  });

  await record("Cancelamento definitivo de wait", async () => {
    const body = definition("crm.opportunity.created", [
      { id: "wait", type: "wait", mode: "duration", amount: 1, unit: "minutes" },
      { id: "must_not_run", type: "action", actionType: "internal.create_notification", params: { title: "Cancelado", message: token } },
    ]);
    const automation = await createAutomation(clinicId, "crm.opportunity.created", "Cancel wait", body);
    const event = await createEvent(clinicId, "crm.opportunity.created", "crm_opportunity", opportunity.id);
    const waiting = await startAndExecute(event, automation.id);
    const wait = await one(db.from("automation_waits").select("*").eq("run_id", waiting.id).single(), "wait cancelavel");
    const demoEmail = process.env.AUTOMATION_HOMOLOGATION_DEMO_EMAIL;
    const demoPassword = process.env.AUTOMATION_HOMOLOGATION_DEMO_PASSWORD;
    assert(anonKey && demoEmail && demoPassword, "Credenciais autenticadas da demo nao informadas para o teste de cancelamento.");
    const authenticatedDb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await authenticatedDb.auth.signInWithPassword({ email: demoEmail, password: demoPassword });
    if (signedIn.error) throw signedIn.error;
    try {
      const cancelled = await authenticatedDb.rpc("cancel_automation_run", { p_clinica_id: clinicId, p_run_id: waiting.id });
      if (cancelled.error) throw cancelled.error;
    } finally {
      await authenticatedDb.auth.signOut();
    }
    const resumed = await resumeAutomationWait({ ...wait, status: "processing" });
    const finalWait = await one(db.from("automation_waits").select("status").eq("id", wait.id).single(), "wait cancelado");
    assert(resumed.status === "cancelled" && finalWait.status === "cancelled", "Run cancelado foi ressuscitado.");
    return { runId: waiting.id, waitStatus: finalWait.status };
  });

  await record("Retry transitorio e erro permanente", async () => {
    const transient = definition("crm.opportunity.created", [{ id: "task", type: "action", actionType: "internal.create_notification", params: { title: "Retry", message: token } }]);
    const transientAutomation = await createAutomation(clinicId, "crm.opportunity.created", "Retry transitorio", transient);
    const transientEvent = await createEvent(clinicId, "crm.opportunity.created", "crm_opportunity", opportunity.id);
    await processAutomationOutboxEvent(transientEvent);
    const run = await one(db.from("automation_runs").select("*").eq("source_event_id", transientEvent.id).eq("automation_id", transientAutomation.id).single(), "run retry");
    tracked.runs.push(run.id);
    await db.from("automation_action_receipts").insert({ clinica_id: clinicId, run_id: run.id, step_id: "task", action_type: "internal.create_notification", idempotency_key: `automation:${run.id}:step:task`, status: "processing" });
    await db.from("automation_runs").update({ status: "running", attempts: 1 }).eq("id", run.id);
    const queued = await continueAutomationRun(run.id);
    assert(queued.status === "queued", "Falha transitoria nao agendou retry.");
    const retryRow = await one(db.from("automation_runs").select("status,next_attempt_at").eq("id", run.id).single(), "retry agendado");
    assert(retryRow.status === "queued" && Date.parse(retryRow.next_attempt_at) > Date.now(), "Backoff nao foi persistido.");
    await db.from("automation_action_receipts").delete().eq("run_id", run.id).eq("step_id", "task");
    await db.from("automation_runs").update({ status: "running", attempts: 2, next_attempt_at: new Date().toISOString() }).eq("id", run.id);
    const recovered = await continueAutomationRun(run.id);
    assert(recovered.status === "completed", "Retry posterior nao concluiu.");

    const permanent = definition("crm.opportunity.created", [{ id: "invalid", type: "action", actionType: "invalid.action", params: {} }]);
    const permanentAutomation = await createAutomation(clinicId, "crm.opportunity.created", "Erro permanente", permanent);
    const permanentEvent = await createEvent(clinicId, "crm.opportunity.created", "crm_opportunity", opportunity.id);
    const failed = await startAndExecute(permanentEvent, permanentAutomation.id);
    assert(failed.status === "failed", `Erro permanente terminou como ${failed.status}.`);
    return { retryRunId: run.id, retryAttempts: 2, permanentRunId: failed.id };
  });

  await record("Agenda segura", async () => {
    const body = definition("booking.created", [{ id: "reminder", type: "action", actionType: "agenda.register_reminder", params: { channel: "interno", message: token } }]);
    const automation = await createAutomation(clinicId, "booking.created", "Agenda segura", body);
    const event = await createEvent(clinicId, "booking.created", "booking", randomUUID());
    const run = await startAndExecute(event, automation.id);
    const actionReceipt = await receipt(run.id, "reminder");
    assert(run.status === "completed" && actionReceipt.status === "completed", "Acao segura da agenda falhou.");
    return { runId: run.id, taskId: actionReceipt.entity_id };
  });

  await record("Financeiro seguro", async () => {
    const body = definition("finance.receivable.overdue", [{ id: "collection", type: "action", actionType: "finance.create_collection_task", params: { title: "Cobranca controlada", due_in_minutes: 0 } }]);
    const automation = await createAutomation(clinicId, "finance.receivable.overdue", "Financeiro seguro", body);
    const event = await createEvent(clinicId, "finance.receivable.overdue", "finance_receivable", randomUUID());
    const run = await startAndExecute(event, automation.id);
    const actionReceipt = await receipt(run.id, "collection");
    assert(run.status === "completed" && actionReceipt.status === "completed", "Tarefa financeira segura falhou.");
    return { runId: run.id, taskId: actionReceipt.entity_id, moneyMutation: false };
  });

  await record("WhatsApp indisponivel sem simular envio", async () => {
    const body = definition("crm.opportunity.created", [{ id: "whatsapp", type: "action", actionType: "communication.send_whatsapp", params: { template_purpose: "booking_created" } }]);
    const automation = await createAutomation(clinicId, "crm.opportunity.created", "WhatsApp unavailable", body);
    const event = await createEvent(clinicId, "crm.opportunity.created", "crm_opportunity", opportunity.id);
    const run = await startAndExecute(event, automation.id);
    const actionReceipt = await receipt(run.id, "whatsapp");
    assert(run.status === "failed" && actionReceipt.status === "unavailable", "WhatsApp nao retornou indisponibilidade controlada.");
    return { runId: run.id, receiptStatus: actionReceipt.status, reason: actionReceipt.result?.reason };
  });

  await record("High-risk bloqueado", async () => {
    const body = definition("booking.created", [{ id: "high_risk", type: "action", actionType: "agenda.update_status", params: { status: "cancelado" } }]);
    const automation = await createAutomation(clinicId, "booking.created", "High risk", body);
    const event = await createEvent(clinicId, "booking.created", "booking", randomUUID());
    const run = await startAndExecute(event, automation.id);
    const actionReceipt = await receipt(run.id, "high_risk");
    assert(run.status === "failed" && actionReceipt.status === "blocked" && actionReceipt.result?.reason === "HIGH_RISK_ACTION_BLOCKED", "High-risk nao foi bloqueado.");
    return { runId: run.id, receiptStatus: actionReceipt.status };
  });

  await record("Loop protection por profundidade", async () => {
    const body = definition("crm.opportunity.created", [{ id: "must_not_run", type: "action", actionType: "internal.create_notification", params: { title: "Loop", message: token } }]);
    const automation = await createAutomation(clinicId, "crm.opportunity.created", "Loop guard", body);
    const event = await createEvent(clinicId, "crm.opportunity.created", "crm_opportunity", opportunity.id, { automation_depth: 5 });
    await processAutomationOutboxEvent(event);
    const consumption = await one(db.from("automation_event_consumptions").select("status,reason").eq("source_event_id", event.id).eq("automation_id", automation.id).single(), "consumo bloqueado");
    assert(consumption.status === "loop_blocked" && consumption.reason === "MAX_AUTOMATION_DEPTH", "Limite de profundidade nao bloqueou o loop.");
    return consumption;
  });

  if (process.env.AUTOMATION_HOMOLOGATION_EMAIL) {
    await record("E-mail real controlado", async () => {
      const body = definition("crm.opportunity.created", [{ id: "email", type: "action", actionType: "communication.send_email", params: { subject: "Homologacao NexaWi Clinicas", message: `Envio controlado ${token}` } }]);
      const automation = await createAutomation(clinicId, "crm.opportunity.created", "Email real", body);
      const event = await createEvent(clinicId, "crm.opportunity.created", "crm_opportunity", opportunity.id);
      const run = await startAndExecute(event, automation.id);
      assert(run.status === "completed", `E-mail terminou como ${run.status}.`);
      return { runId: run.id, providerResult: (await receipt(run.id, "email")).result };
    });
  } else {
    results.push({ name: "E-mail real controlado", status: "NOT_EXECUTED", reason: "AUTOMATION_HOMOLOGATION_EMAIL nao informado." });
  }
} finally {
  await cleanup(clinicId).catch((error) => results.push({ name: "Limpeza do tenant demo", status: "FAIL", error: safeError(error) }));
}

const failed = results.some((item) => item.status === "FAIL");
console.log(JSON.stringify({ token, demoSlug: DEMO_SLUG, highRiskEnabled: false, results }, null, 2));
process.exitCode = failed ? 1 : 0;
