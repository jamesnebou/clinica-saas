import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { workerHttpResult } from "../src/lib/cron/result.mjs";
import {
  classifyTemplateLifecycle,
  deferredTemplateJobUpdate,
  notificationCancellationReason,
} from "../src/lib/whatsapp/template-lifecycle.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("template APPROVED segue para envio", () => {
  assert.deepEqual(classifyTemplateLifecycle({ status: "APPROVED" }), {
    action: "send",
    status: "APPROVED",
    message: null,
  });
});

test("template PENDING e estados transitórios são adiados sem falha permanente", () => {
  for (const status of ["PENDING", "IN_APPEAL", "PAUSED"]) {
    const decision = classifyTemplateLifecycle({ status });
    assert.equal(decision.action, "defer");
    assert.equal(decision.status, status);
  }
});

test("adiamento de template preserva elegibilidade e não consome tentativa", () => {
  const now = Date.parse("2026-09-11T12:00:00.000Z");
  const update = deferredTemplateJobUpdate({ attempt_count: 3 }, now);
  assert.equal(update.status, "retry");
  assert.equal(update.attempt_count, 2);
  assert.ok(Date.parse(update.scheduled_at) >= now + 60 * 60 * 1000);
  assert.equal(update.locked_at, null);
  assert.equal(update.locked_by, null);
});

test("template REJECTED e estados finais inválidos são permanentes", () => {
  for (const status of ["REJECTED", "DISABLED", "PENDING_DELETION", "DELETED", "LIMIT_EXCEEDED"]) {
    assert.equal(classifyTemplateLifecycle({ status }).action, "dead");
  }
});

test("template ausente é erro permanente de configuração", () => {
  const decision = classifyTemplateLifecycle(null);
  assert.equal(decision.action, "dead");
  assert.equal(decision.status, "MISSING");
});

test("pagamento confirmado e booking inativo cancelam jobs obsoletos", () => {
  assert.equal(notificationCancellationReason({ purpose: "booking_payment_pending", paymentStatus: "pago" }), "payment_not_pending");
  assert.equal(notificationCancellationReason({ purpose: "appointment_reminder_24h", bookingStatus: "cancelado" }), "booking_inactive");
  assert.equal(notificationCancellationReason({ purpose: "appointment_reminder_3h", bookingStatus: "concluido" }), "booking_inactive");
});

test("template PENDING adiado mantém health saudável; falha real mantém 422", () => {
  const deferred = workerHttpResult({ processed: 1, succeeded: 0, skipped: 0, deferred: 1, retryScheduled: 0, failed: 0, dead: 0 });
  assert.equal(deferred.status, 200);
  assert.equal(deferred.body.ok, true);
  assert.equal(deferred.body.deferred, 1);

  const failed = workerHttpResult({ processed: 1, succeeded: 0, skipped: 0, deferred: 0, retryScheduled: 0, failed: 0, dead: 1 });
  assert.equal(failed.status, 422);
  assert.equal(failed.body.ok, false);
});

test("engine avalia obsolescência antes do lifecycle e não filtra APPROVED no banco", () => {
  const source = read("src/lib/whatsapp/engine.js");
  assert.doesNotMatch(source, /eq\("status",\s*"APPROVED"\)/);
  assert.ok(source.indexOf("notificationCancellationReason") < source.indexOf("classifyTemplateLifecycle(context.template)"));
  assert.match(source, /result\?\.deferred/);
  assert.match(source, /summary\.deferred \+= 1/);
});
