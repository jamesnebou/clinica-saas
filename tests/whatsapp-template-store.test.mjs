import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { memoryDatabase, setDatabase } from "./helpers/whatsapp-db.mjs";
import { createTemplateRefresher, readConnectionTemplates, syncTemplateStore } from "../src/lib/whatsapp/template-store.mjs";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
    if (specifier === "@/lib/supabase/admin") return { url: new URL("./helpers/whatsapp-db.mjs", import.meta.url).href, shortCircuit: true };
    if (specifier === "@/lib/clinic/schedule") return { url: new URL("../src/lib/clinic/schedule.js", import.meta.url).href, shortCircuit: true };
    try { return next(specifier, context); } catch (error) {
      if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return next(specifier + ".js", context);
      throw error;
    }
  },
});
const { processNotificationJob, processOutboxEvent } = await import("../src/lib/whatsapp/engine.js");
const { MetaCloudProvider } = await import("../src/lib/whatsapp/meta/provider.js");
const { MetaGraphClient } = await import("../src/lib/whatsapp/meta/client.js");
const connection = { id: "current", clinica_id: "clinic", waba_id: "current-waba", connection_status: "connected", onboarding_status: "ready", is_primary: true };
const template = { id: "pending", clinica_id: "clinic", connection_id: "current", waba_id: "current-waba", name: "nexawi_booking_created", language: "pt_BR", purpose: "booking_created", status: "PENDING" };
const remote = (status) => [{ id: "meta-template", name: template.name, language: "pt_BR", status }];

test("dashboard reads only the current clinic, connection and WABA", async () => {
  const db = memoryDatabase({ whatsapp_templates: [
    template,
    { ...template, id: "old", connection_id: "old", status: "APPROVED" },
    { ...template, id: "other-clinic", clinica_id: "other", status: "APPROVED" },
    { ...template, id: "old-waba", waba_id: "old-waba", status: "APPROVED" },
  ] });
  assert.deepEqual((await readConnectionTemplates(db, connection)).data.map((row) => row.id), ["pending"]);
  const calls = db.calls.length;
  assert.deepEqual((await readConnectionTemplates(db, null)).data, []);
  assert.equal(db.calls.length, calls);
  const page = readFileSync(new URL("../src/app/dashboard/whatsapp/page.js", import.meta.url), "utf8");
  assert.match(page, /readConnectionTemplates\(supabase, connectionResult.error \? null : connectionResult.data\)/);
  assert.doesNotMatch(page, /from\("whatsapp_templates"\)/);
});

test("sync updates approval, is idempotent and preserves disconnected history", async () => {
  const db = memoryDatabase({ whatsapp_templates: [template, { ...template, id: "old", connection_id: "old", status: "APPROVED" }] });
  const provider = { syncTemplates: async () => remote("APPROVED") };
  await syncTemplateStore(db, connection, provider);
  await syncTemplateStore(db, connection, provider);
  assert.equal(db.tables.whatsapp_templates.length, 2);
  assert.equal(db.tables.whatsapp_templates[0].status, "APPROVED");
  assert.equal(db.tables.whatsapp_templates[1].status, "APPROVED");
  await syncTemplateStore(db, connection, { syncTemplates: async () => [] });
  assert.equal(db.tables.whatsapp_templates[0].status, "DELETED");
  assert.equal(db.tables.whatsapp_templates[1].status, "APPROVED");
});

test("failed remote fetch never invalidates cached templates and is deduplicated per batch", async () => {
  const db = memoryDatabase({ whatsapp_templates: [template] });
  let calls = 0;
  const refresh = createTemplateRefresher(db, { async syncTemplates() { calls++; throw new Error("offline"); } });
  await assert.rejects(refresh(connection), /offline/);
  await assert.rejects(refresh(connection), /offline/);
  assert.equal(calls, 1);
  assert.equal(db.tables.whatsapp_templates[0].status, "PENDING");
  assert.equal(db.calls.length, 0);
});

test("malformed snapshots and invalid connection do not write; custom templates are preserved", async () => {
  const custom = { ...template, id: "custom", name: "custom_template", status: "APPROVED" };
  const db = memoryDatabase({ whatsapp_templates: [template, custom] });
  for (const response of [null, {}, [null], [{ status: "PENDING" }]]) {
    await assert.rejects(syncTemplateStore(db, connection, { syncTemplates: async () => response }), /Invalid template response/);
  }
  await assert.rejects(syncTemplateStore(db, null, { async syncTemplates() { assert.fail("Must not fetch"); } }), /Invalid template connection/);
  assert.equal(db.calls.length, 0);
  await syncTemplateStore(db, connection, { syncTemplates: async () => [] });
  assert.equal(db.tables.whatsapp_templates.find((row) => row.id === "custom").status, "APPROVED");
});

test("a database write failure fails synchronization instead of reporting success", async () => {
  const db = memoryDatabase({ whatsapp_templates: [template] });
  const original = db.from;
  db.from = (table) => {
    const query = original(table);
    query.upsert = async () => ({ error: { code: "08006" } });
    return query;
  };
  await assert.rejects(syncTemplateStore(db, connection, { syncTemplates: async () => remote("APPROVED") }), { code: "08006" });
  assert.equal(db.tables.whatsapp_templates[0].status, "PENDING");
});

test("provider requires complete pagination and forwards one timeout signal", async () => {
  const calls = [];
  const provider = new MetaCloudProvider({ client: { async listTemplates(waba, after, token, signal) {
    calls.push({ waba, after, signal });
    return after ? { data: remote("PENDING") } : { data: remote("APPROVED"), paging: { next: "next", cursors: { after: "cursor" } } };
  } } });
  assert.equal((await provider.syncTemplates(connection)).length, 2);
  assert.equal(calls[0].signal, calls[1].signal);
  assert.ok(calls[0].signal instanceof AbortSignal);
  for (const page of [{}, { data: [], paging: { next: "next" } }, { data: [], paging: { next: "next", cursors: { after: "repeated" } } }]) {
    const broken = new MetaCloudProvider({ client: { async listTemplates() { return page; } } });
    await assert.rejects(broken.syncTemplates(connection), /template/i);
  }
});

test("template requests forward abort signal to fetch", async () => {
  const previous = process.env.META_GRAPH_API_VERSION;
  process.env.META_GRAPH_API_VERSION = "v23.0";
  try {
    const signal = AbortSignal.abort();
    const client = new MetaGraphClient({ accessToken: "test", async fetchImpl(url, options) {
      assert.equal(options.signal, signal);
      assert.ok(url.pathname.endsWith("/current-waba/message_templates"));
      return { ok: true, json: async () => ({ data: [] }) };
    } });
    await client.listTemplates(connection.waba_id, null, undefined, signal);
  } finally {
    if (previous === undefined) delete process.env.META_GRAPH_API_VERSION;
    else process.env.META_GRAPH_API_VERSION = previous;
  }
});

function jobDatabase({ purpose = "booking_created", bookingStatus = "agendado", consent = true } = {}) {
  const job = { id: "job", event_id: "event", clinica_id: "clinic", template_purpose: purpose, recipient: "5511999990000", attempt_count: 5, max_attempts: 5 };
  const db = memoryDatabase({
    notification_jobs: [job],
    domain_outbox_events: [{ id: "event", aggregate_id: "booking", clinica_id: "clinic" }],
    agendamentos: [{ id: "booking", clinica_id: "clinic", cliente_id: "client", status: bookingStatus, inicio: "2026-10-01T12:00:00Z", clientes: { nome: "Test" }, clinicas: { nome: "Test clinic" } }],
    whatsapp_connections: [connection],
    whatsapp_templates: [{ ...template, purpose }],
    communication_preferences: [{ clinica_id: "clinic", phone_normalized: job.recipient, whatsapp_transactional_opt_in: consent, opt_out_at: null }],
  });
  setDatabase(db);
  return { db, job };
}

test("worker resumes pending job after approval without manual synchronization", async () => {
  const { db, job } = jobDatabase();
  let sent = 0;
  const provider = { syncTemplates: async () => remote("APPROVED"), async sendTemplate({ template: sentTemplate }) {
    assert.equal(sentTemplate.status, "APPROVED");
    sent++;
    return { messages: [{ id: "meta-message" }] };
  } };
  assert.equal((await processNotificationJob(job, { provider })).metaId, "meta-message");
  assert.equal(sent, 1);
  assert.equal(db.tables.notification_jobs[0].status, "sent");
});

test("still-pending and failed-sync jobs preserve attempts without sending", async () => {
  for (const fail of [false, true]) {
    const { db, job } = jobDatabase();
    const provider = {
      async syncTemplates() { if (fail) throw new Error("offline"); return remote("PENDING"); },
      async sendTemplate() { assert.fail("Must not send"); },
    };
    const result = await processNotificationJob(job, { provider });
    assert.equal(fail ? result.retryScheduled : result.deferred, true);
    assert.equal(db.tables.notification_jobs[0].status, "retry");
    assert.equal(db.tables.notification_jobs[0].attempt_count, 4);
    assert.equal(db.tables.whatsapp_messages, undefined);
  }
});

test("cancelled reminders and missing consent never sync or send", async () => {
  const cancelled = jobDatabase({ purpose: "appointment_reminder_24h", bookingStatus: "cancelado" });
  assert.equal((await processNotificationJob(cancelled.job, { provider: { async syncTemplates() { assert.fail("Must not sync"); } } })).cancelled, true);
  const { db, job } = jobDatabase({ consent: false });
  const result = await processNotificationJob(job, { provider: {
    async syncTemplates() { assert.fail("Must not sync without consent"); },
    async sendTemplate() { assert.fail("Must not send without consent"); },
  } });
  assert.equal(result.cancelled, true);
  assert.equal(result.reason, "CONSENT_REQUIRED");
  assert.equal(db.tables.notification_jobs[0].status, "cancelled");
  assert.equal(db.tables.eventos_analiticos[0].event_name, "whatsapp_skipped");
});

test("revoked and absent consent suppress scheduled messages without creating outbound records", async () => {
  for (const absent of [false, true]) {
    const { db, job } = jobDatabase();
    if (absent) db.tables.communication_preferences = [];
    else db.tables.communication_preferences[0].opt_out_at = new Date().toISOString();
    assert.equal((await processNotificationJob(job, { provider: {} })).cancelled, true);
    assert.equal(db.tables.notification_jobs[0].status, "cancelled");
    assert.equal(db.tables.whatsapp_messages, undefined);
  }
});

test("consent lookup errors remain technical failures rather than consent suppressions", async () => {
  const { db, job } = jobDatabase();
  job.attempt_count = 1;
  const from = db.from.bind(db);
  db.from = (table) => {
    const query = from(table);
    if (table === "communication_preferences") query.maybeSingle = async () => ({ error: { code: "08006", message: "Database unavailable" } });
    return query;
  };
  await assert.rejects(processNotificationJob(job, { provider: {} }), { workerDisposition: "retry" });
  assert.equal(db.tables.notification_jobs[0].status, "retry");
});

test("outbox enqueues only opted-in recipients and records expected suppressions", async () => {
  for (const consent of [false, true]) {
    const { db } = jobDatabase({ consent });
    db.tables.notification_jobs = [];
    db.tables.agendamentos[0].clientes.telefone = "5511999990000";
    db.tables.whatsapp_automation_settings = [{ clinica_id: "clinic", enabled: true }];
    const event = { id: "event", clinica_id: "clinic", aggregate_id: "booking", event_name: "booking.created" };
    const result = await processOutboxEvent(event);
    assert.equal(Boolean(result.skipped), !consent);
    assert.equal(db.tables.notification_jobs.length, consent ? 1 : 0);
    assert.equal(db.tables.domain_outbox_events[0].status, "processed");
  }
});
