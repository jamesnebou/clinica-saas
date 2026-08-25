import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  PURPOSE_BY_EVENT,
  deterministicInteractionToken,
  hashOpaqueToken,
  nextRetryAt,
  normalizeWhatsAppPhone,
  webhookDeduplicationKey,
} from "../src/lib/whatsapp/core.mjs";
import { verifyMetaWebhookSignature } from "../src/lib/whatsapp/meta/webhook-core.mjs";

test("normaliza telefone brasileiro sem misturar tenants", () => {
  assert.equal(normalizeWhatsAppPhone("(77) 98865-6394"), "5577988656394");
  assert.equal(normalizeWhatsAppPhone("+55 77 98865-6394"), "5577988656394");
  assert.equal(normalizeWhatsAppPhone("123"), "");
});

test("token interativo é determinístico por job e não é armazenado em claro", () => {
  const token = deterministicInteractionToken("job-a", "segredo-forte");
  assert.equal(token, deterministicInteractionToken("job-a", "segredo-forte"));
  assert.notEqual(token, deterministicInteractionToken("job-b", "segredo-forte"));
  assert.notEqual(hashOpaqueToken(token), token);
});

test("assinatura Meta aceita corpo íntegro e rejeita adulteração", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  const secret = "app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyMetaWebhookSignature(body, signature, secret), true);
  assert.equal(verifyMetaWebhookSignature(`${body}x`, signature, secret), false);
});

test("deduplicação considera todos os campos do envelope", () => {
  const base = webhookDeduplicationKey({ id: "wamid.1", status: "sent", timestamp: "1" });
  assert.equal(base, webhookDeduplicationKey({ id: "wamid.1", status: "sent", timestamp: "1" }));
  assert.notEqual(base, webhookDeduplicationKey({ id: "wamid.1", status: "read", timestamp: "1" }));
});

test("retry aplica backoff progressivo limitado", () => {
  const now = Date.parse("2026-08-25T12:00:00Z");
  assert.equal(Date.parse(nextRetryAt(1, now)) - now, 60_000);
  assert.equal(Date.parse(nextRetryAt(3, now)) - now, 900_000);
  assert.equal(Date.parse(nextRetryAt(99, now)) - now, 3_600_000);
});

test("confirmação de presença não dispara template de pagamento", () => {
  assert.equal(PURPOSE_BY_EVENT["booking.confirmed"], undefined);
  assert.equal(PURPOSE_BY_EVENT["payment.confirmed"], "payment_confirmed");
});
