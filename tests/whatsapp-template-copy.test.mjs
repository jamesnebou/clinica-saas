import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { AUTOMATIC_MESSAGE_FOOTER, buildTemplateMessage, buildTemplateSubmission, TEMPLATE_CATALOG, templateContentMatches, templatePreview } from "../src/lib/whatsapp/meta/templates.js";
import { prepareConnectionTemplates } from "../src/lib/whatsapp/template-preparation.mjs";
import { memoryDatabase } from "./helpers/whatsapp-db.mjs";

const connection = { id: "connection", clinica_id: "clinic", waba_id: "waba" };
const purposes = Object.keys(TEMPLATE_CATALOG);
function rows(status = "APPROVED") {
  return purposes.map((purpose, index) => ({
    ...buildTemplateSubmission(purpose), id: String(index), meta_template_id: String(100 + index),
    connection_id: connection.id, clinica_id: connection.clinica_id, waba_id: connection.waba_id, purpose, status,
  }));
}

test("all nine templates identify automatic messages with exactly one contextual emoji", () => {
  assert.equal(purposes.length, 9);
  for (const purpose of purposes) {
    const payload = buildTemplateSubmission(purpose);
    const body = payload.components.find((item) => item.type === "BODY");
    const footer = payload.components.filter((item) => item.type === "FOOTER");
    assert.deepEqual(footer, [{ type: "FOOTER", text: "Mensagem automática da clínica!" }]);
    assert.equal(footer[0].text, AUTOMATIC_MESSAGE_FOOTER);
    assert.ok(footer[0].text.length <= 60);
    assert.equal([...body.text.matchAll(/\p{Extended_Pictographic}/gu)].length, 1);
    assert.equal(body.example.body_text[0].length, [...body.text.matchAll(/\{\{\d+\}\}/g)].length);
    assert.equal(payload.category, "UTILITY");
    const buttons = payload.components.find((item) => item.type === "BUTTONS");
    assert.equal(Boolean(buttons), purpose.startsWith("appointment_reminder_"));
    if (buttons) assert.deepEqual(buttons.buttons, [{ type: "QUICK_REPLY", text: "Confirmar presença" }]);
  }
});

test("preview uses actual stored components, never invents a footer for old templates", () => {
  assert.deepEqual(templatePreview({ purpose: "booking_created", components: [{ type: "BODY", text: "Olá, {{1}}." }] }), { body: "Olá, Mariana.", footer: null });
  const template = rows()[0];
  const preview = templatePreview(template);
  assert.ok(preview.body.includes("Mariana"));
  assert.ok(preview.body.includes("👋"));
  assert.equal(preview.footer, AUTOMATIC_MESSAGE_FOOTER);
  assert.equal(templatePreview({ components: [] }).footer, null);
});

test("footer is static on Meta, not an unsupported outbound component", () => {
  const message = buildTemplateMessage({ to: "5511999990000", template: rows()[0], variables: ["Test", "Clinic", "01/10/2026", "14:00"] });
  assert.deepEqual(message.template.components.map((item) => item.type), ["body"]);
});

test("content comparison ignores examples but detects body footer and button edits", () => {
  const payload = buildTemplateSubmission("appointment_reminder_24h");
  const stored = structuredClone(payload);
  delete stored.components[0].example;
  assert.equal(templateContentMatches(stored, payload), true);
  for (const type of ["BODY", "FOOTER", "BUTTONS"]) {
    const changed = structuredClone(stored);
    const item = changed.components.find((c) => c.type === type);
    if (type === "BUTTONS") item.buttons[0].text = "Other";
    else item.text += " Other";
    assert.equal(templateContentMatches(changed, payload), false);
  }
});

function setup(existing) {
  const db = memoryDatabase({ whatsapp_templates: existing });
  const calls = [];
  const provider = { client: {
    async createTemplate(id, payload) { calls.push({ operation: "create", id, payload }); },
    async updateTemplate(id, components) { calls.push({ operation: "update", id, components }); },
  } };
  return { db, provider, calls };
}

test("old approved templates are edited by ID without duplicate creation", async () => {
  const existing = rows();
  existing[0].components = [{ type: "BODY", text: "Old message" }];
  const { db, provider, calls } = setup(existing);
  assert.deepEqual(await prepareConnectionTemplates({ db, provider, connection, existing }), { submitted: 0, updated: 1, blocked: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, "update");
  assert.equal(calls[0].id, "100");
  assert.equal(db.tables.whatsapp_templates[0].status, "PENDING");
  assert.equal(db.tables.whatsapp_templates[0].last_synced_at, null);
  assert.deepEqual(await prepareConnectionTemplates({ db, provider, connection, existing: db.tables.whatsapp_templates }), { submitted: 0, updated: 0, blocked: 0 });
  assert.equal(calls.length, 1);
});

test("pending templates requiring new copy are reported instead of duplicated", async () => {
  const existing = rows("PENDING");
  existing[0].components = [];
  const { db, provider, calls } = setup(existing);
  assert.deepEqual(await prepareConnectionTemplates({ db, provider, connection, existing }), { submitted: 0, updated: 0, blocked: 1 });
  assert.equal(calls.length, 0);
});

test("only editable statuses and known template IDs allow updates", async () => {
  for (const status of ["REJECTED", "PAUSED", "IN_APPEAL", "DISABLED", "PENDING_DELETION"]) {
    const existing = rows();
    existing[0].status = status;
    existing[0].components = [];
    const { db, provider } = setup(existing);
    const result = await prepareConnectionTemplates({ db, provider, connection, existing });
    assert.equal(result.updated, ["REJECTED", "PAUSED"].includes(status) ? 1 : 0);
    assert.equal(result.submitted, 0);
  }
  const existing = rows();
  existing[0].meta_template_id = null;
  existing[0].components = [];
  const { db, provider, calls } = setup(existing);
  assert.equal((await prepareConnectionTemplates({ db, provider, connection, existing })).blocked, 1);
  assert.equal(calls.length, 0);
});

test("foreign connection and tenant templates are never edited", async () => {
  const existing = rows().map((item) => ({ ...item, clinica_id: "other", components: [] }));
  const { db, provider, calls } = setup(existing);
  assert.equal((await prepareConnectionTemplates({ db, provider, connection, existing })).submitted, 9);
  assert.ok(calls.every((item) => item.operation === "create" && item.id === connection.waba_id));
  assert.ok(db.tables.whatsapp_templates.every((item) => item.status === "APPROVED"));
});

test("failed Meta edit does not overwrite stored content or approval", async () => {
  const existing = rows();
  existing[0].components = [];
  const { db, provider } = setup(existing);
  provider.client.updateTemplate = async () => { throw new Error("Meta unavailable"); };
  await assert.rejects(prepareConnectionTemplates({ db, provider, connection, existing }), /Meta unavailable/);
  assert.deepEqual(db.tables.whatsapp_templates[0].components, []);
  assert.equal(db.tables.whatsapp_templates[0].status, "APPROVED");
});

test("Graph edit posts only components to the existing template ID", async () => {
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
      if (specifier === "./errors") return next("./errors.js", context);
      return next(specifier, context);
    },
  });
  const previous = process.env.META_GRAPH_API_VERSION;
  process.env.META_GRAPH_API_VERSION = "v23.0";
  try {
    const { MetaGraphClient } = await import("../src/lib/whatsapp/meta/client.js");
    const components = buildTemplateSubmission("booking_created").components;
    const client = new MetaGraphClient({ accessToken: "test-only", async fetchImpl(url, options) {
      assert.equal(url.pathname, "/v23.0/12345");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { components });
      return { ok: true, json: async () => ({ success: true }) };
    } });
    assert.deepEqual(await client.updateTemplate("12345", components), { success: true });
  } finally {
    hooks.deregister();
    if (previous === undefined) delete process.env.META_GRAPH_API_VERSION;
    else process.env.META_GRAPH_API_VERSION = previous;
  }
});
