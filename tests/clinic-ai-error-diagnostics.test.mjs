import test from "node:test";
import assert from "node:assert/strict";
import { AISDKError, APICallError, NoObjectGeneratedError, NoSuchModelError, RetryError, StreamProviderError } from "ai";
import { classifyAiGenerationError } from "../src/lib/ai/summary-error-diagnostics.mjs";
import { generateClinicSummary } from "../src/lib/ai/summary-generation.mjs";

const apiError = (statusCode, extra = {}) => new APICallError({
  message: "Paciente Maria; Rua Ficticia; CPF 000; Authorization: Bearer fake-secret",
  url: "https://example.invalid/private",
  requestBodyValues: { patient: "Paciente Maria" },
  statusCode,
  responseBody: "Rua Ficticia",
  responseHeaders: { Authorization: "Bearer fake-secret" },
  cause: new Error("CPF 000"),
  ...extra,
});

test("classifies documented AI SDK errors without reading response text", () => {
  assert.deepEqual(classifyAiGenerationError(apiError(401)), {
    aiErrorCategory: "AUTH", aiErrorName: "AI_APICallError", aiStatusCode: 401,
    aiProviderCode: null, aiRetryable: false,
  });
  assert.equal(classifyAiGenerationError(apiError(402)).aiErrorCategory, "PAYMENT_OR_CREDITS");
  assert.equal(classifyAiGenerationError(apiError(429)).aiErrorCategory, "RATE_LIMIT");
  assert.equal(classifyAiGenerationError(apiError(503)).aiErrorCategory, "UNKNOWN");
  assert.equal(classifyAiGenerationError(new NoSuchModelError({ modelId: "fake/model", modelType: "languageModel" })).aiErrorCategory, "MODEL");
  assert.equal(classifyAiGenerationError(new NoObjectGeneratedError({ response: {}, usage: {}, finishReason: "error" })).aiErrorCategory, "STRUCTURED_OUTPUT");
  assert.equal(classifyAiGenerationError(new Error("Paciente Maria")).aiErrorCategory, "UNKNOWN");
});

test("only allowlisted structured provider codes are retained", () => {
  const budget = new StreamProviderError({ message: "private", statusCode: 402, code: "quota_for_entity_exceeded" });
  assert.equal(classifyAiGenerationError(budget).aiErrorCategory, "BUDGET");
  assert.equal(classifyAiGenerationError(budget).aiProviderCode, "quota_for_entity_exceeded");
  const unsafe = new StreamProviderError({ message: "private", code: "Paciente Maria; Authorization: Bearer fake-secret" });
  assert.equal(classifyAiGenerationError(unsafe).aiProviderCode, null);
  assert.equal(classifyAiGenerationError(new StreamProviderError({ message: "private", statusCode: 503 })).aiErrorCategory, "PROVIDER");
  assert.equal(classifyAiGenerationError(new RetryError({ message: "private", reason: "maxRetriesExceeded", errors: [apiError(429)] })).aiErrorCategory, "RATE_LIMIT");
});

test("production gateway auth wrapper is classified without reading its message", () => {
  const wrapped = new AISDKError({ name: "GatewayError", message: "Authorization: Bearer fake-secret" });
  assert.deepEqual(classifyAiGenerationError(wrapped), {
    aiErrorCategory: "AUTH", aiErrorName: "GatewayError", aiStatusCode: null,
    aiProviderCode: null, aiRetryable: null,
  });
});

test("error log and HTTP error exclude sensitive synthetic error fields", async () => {
  const snapshot = {
    period: { days: 30 },
    agenda: { total: 0, completed: 0, confirmed: 0, canceled: 0, noShows: 0, upcoming: 0 },
    finance: { realizedEntries: 0, realizedExits: 0 },
    customers: { total: 0, newInPeriod: 0 },
    procedures: [],
    trends: { appointmentsPercent: null, receivedPercent: null, noShowRatePercent: null },
  };
  const previous = console.warn;
  let record;
  console.warn = (...args) => { record = args; };
  try {
    await assert.rejects(generateClinicSummary({ snapshot, model: "test/model", tenantHash: "opaque", generate: async () => {
      const error = apiError(401);
      error.stack = "Authorization: Bearer fake-secret";
      throw error;
    } }), { message: "AI_UNAVAILABLE" });
  } finally {
    console.warn = previous;
  }
  assert.equal(record[0], "clinic_ai_summary");
  assert.equal(record[1].aiErrorCategory, "AUTH");
  const serialized = JSON.stringify(record);
  for (const fragment of ["Paciente Maria", "Rua Ficticia", "CPF 000", "Authorization", "fake-secret", "responseBody", "requestBodyValues", "cause", "stack"]) {
    assert.equal(serialized.includes(fragment), false, fragment);
  }
});
