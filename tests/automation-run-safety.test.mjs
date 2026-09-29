import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { memoryDatabase, setDatabase } from "./helpers/whatsapp-db.mjs";
import { isDemonstrationRun } from "../src/lib/automations/core.mjs";

let actions = 0;
let actionError = null;
globalThis.__automationSafetyAction = async () => {
  actions++;
  if (actionError) throw actionError;
  return { status: "completed" };
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const mocks = {
      "server-only": "export {};",
      "./executor.js": "export const executeRegisteredAction = (...args) => globalThis.__automationSafetyAction(...args);",
      "./events.js": "export const normalizeAutomationEvent = row => row;",
      "./observability.js": "export async function auditAutomation() {} export async function recordAutomationMetric() {}",
    };
    if (Object.hasOwn(mocks, specifier)) return { url: "data:text/javascript," + encodeURIComponent(mocks[specifier]), shortCircuit: true };
    if (specifier === "@/lib/supabase/admin") return { url: new URL("./helpers/whatsapp-db.mjs", import.meta.url).href, shortCircuit: true };
    return next(specifier, context);
  },
});
const { continueAutomationRun, resumeAutomationWait } = await import("../src/lib/automations/engine.js");
hooks.deregister();

function setup(overrides = {}) {
  actions = 0;
  actionError = null;
  const run = {
    id: "run", clinica_id: "clinic", automation_version_id: "version", source_event_id: "event",
    entity_type: "booking", correlation_id: "event", status: "queued", attempts: 1,
    current_step_index: 0, execution_plan: [{ id: "action", type: "action", actionType: "agenda.register_reminder" }],
    context_snapshot: { event: { type: "booking.created", clinica_id: "clinic", subject: { type: "booking", id: "booking" } } },
    ...overrides,
  };
  const wait = { id: "wait", clinica_id: "clinic", run_id: run.id, status: "processing" };
  const db = memoryDatabase({
    automation_runs: [run], automation_waits: [wait],
    automation_versions: [{ id: "version", clinica_id: "clinic", definition: { steps: run.execution_plan } }],
    clinicas: [{ id: "clinic", metadata: {} }],
  });
  setDatabase(db);
  return { db, run, wait };
}
const fixture = {
  entity_type: "demo", source_event_id: null, correlation_id: "demo:lead-follow-up",
  context_snapshot: { event: { type: "crm.lead.created", clinica_id: "clinic" }, clinic_metadata: { demo: true } },
};

test("demo detection requires convergent fixture markers, not just a demo clinic flag", () => {
  assert.equal(isDemonstrationRun(fixture), true);
  for (const change of [{ entity_type: "booking" }, { source_event_id: "real-event" }, { correlation_id: "real-event" }, { context_snapshot: {} }]) {
    assert.equal(isDemonstrationRun({ ...fixture, ...change }), false);
  }
});

test("claimed demonstration run is skipped and its wait cancelled without side effects", async () => {
  const { db } = setup(fixture);
  assert.equal((await continueAutomationRun("run")).status, "skipped");
  assert.equal(db.tables.automation_runs[0].failure_code, "DEMO_FIXTURE");
  assert.equal(db.tables.automation_waits[0].status, "cancelled");
  assert.equal(actions, 0);
  assert.equal(db.calls.some(call => call.table === "clinicas"), false);
});

test("resuming a demonstration wait cannot advance or execute the fictional plan", async () => {
  const { db, wait } = setup({ ...fixture, status: "waiting" });
  assert.equal((await resumeAutomationWait(wait)).status, "skipped");
  assert.equal(db.tables.automation_runs[0].current_step_index, 0);
  assert.equal(db.tables.automation_waits[0].status, "cancelled");
  assert.equal(actions, 0);
});

test("real automation still executes, including in a demo clinic with a real event", async () => {
  const { db } = setup();
  db.tables.automation_runs[0].context_snapshot.clinic_metadata = { demo: true };
  assert.equal((await continueAutomationRun("run")).status, "completed");
  assert.equal(actions, 1);
});

test("missing or cross-tenant event context fails permanently without executing actions", async () => {
  for (const event of [undefined, { clinica_id: "clinic" }, { clinica_id: "other", subject: { type: "booking" } }]) {
    const { db } = setup({ context_snapshot: { event } });
    assert.equal((await continueAutomationRun("run")).status, "failed");
    assert.equal(db.tables.automation_runs[0].failure_code, "INVALID_EVENT_CONTEXT");
    assert.equal(actions, 0);
  }
});

test("retry result matches stored terminal state when attempts are exhausted", async () => {
  for (const attempts of [1, 5]) {
    const { db } = setup({ attempts });
    actionError = Object.assign(new Error("Temporary failure"), { code: "08006" });
    const expected = attempts === 1 ? "queued" : "failed";
    assert.equal((await continueAutomationRun("run")).status, expected);
    assert.equal(db.tables.automation_runs[0].status, expected);
    assert.equal(db.tables.automation_runs[0].failure_code, "08006");
  }
});
