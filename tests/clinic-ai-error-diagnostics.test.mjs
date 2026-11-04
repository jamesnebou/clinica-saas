import test from "node:test";
import assert from "node:assert/strict";
import { AISDKError, APICallError, NoObjectGeneratedError, NoSuchModelError, RetryError, StreamProviderError } from "ai";
import { GatewayInternalServerError } from "@ai-sdk/gateway";
import { classifyAiGenerationError, extractSafeGatewayErrorCode } from "../src/lib/ai/summary-error-diagnostics.mjs";
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
    aiProviderCode: null, aiRetryable: false, aiGatewayErrorType: null,
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
    aiProviderCode: null, aiRetryable: null, aiGatewayErrorType: null,
  });
});

test("extracts the original machine type from the SDK gateway to APICallError cause chain", () => {
  const cause = apiError(403, { responseBody: JSON.stringify({ error: {
    message: "Paciente Maria Authorization Bearer fake-secret",
    type: "access_denied",
  } }) });
  const gateway = new GatewayInternalServerError({ statusCode: 403, cause });
  assert.equal(gateway.type, "internal_server_error");
  assert.equal(extractSafeGatewayErrorCode(gateway), "access_denied");
  assert.equal(classifyAiGenerationError(gateway).aiErrorCategory, "ACCESS_OR_ENTITLEMENT");
});

test("reads structured SDK data and a known gateway type without retaining free text", () => {
  const cause = apiError(403, { data: { error: {
    type: "customer_verification_required", message: "Visit https://example.invalid/private",
  } } });
  const gateway = new GatewayInternalServerError({ statusCode: 403, cause });
  assert.equal(classifyAiGenerationError(gateway).aiGatewayErrorType, "customer_verification_required");
  assert.equal(classifyAiGenerationError(gateway).aiErrorCategory, "CUSTOMER_VERIFICATION");
  const direct = new GatewayInternalServerError({ statusCode: 403 });
  direct.type = "customer_verification_required";
  assert.equal(extractSafeGatewayErrorCode(direct), "customer_verification_required");
});

test("only explicit gateway codes survive nested causes and structured responses", () => {
  for (const type of ["access_denied", "forbidden", "customer_verification_required", "quota_for_entity_exceeded",
    "insufficient_funds", "no_providers_available", "model_not_found", "authentication_error",
    "rate_limit_exceeded", "invalid_request_error"]) {
    assert.equal(extractSafeGatewayErrorCode(apiError(403, { data: { error: { type } } })), type);
  }
  for (const type of ["patient_maria_silva_cpf_12345678900", "unknown_snake_case", "x".repeat(100),
    "Authorization: Bearer fake-secret", 123, { name: "access_denied" }]) {
    const error = new GatewayInternalServerError({ cause: apiError(403, { data: { error: { type } } }) });
    assert.equal(classifyAiGenerationError(error).aiGatewayErrorType, null);
  }
  assert.equal(extractSafeGatewayErrorCode(new GatewayInternalServerError({ cause: apiError(403, {
    responseBody: JSON.stringify({ error: { type: "unknown_snake_case", code: "forbidden" } }),
  }) })), "forbidden");
});

test("arbitrary provider type never reaches clinic_ai_summary log", async () => {
  const snapshot = {
    period: { days: 30 }, agenda: { total: 0, completed: 0, confirmed: 0, canceled: 0, noShows: 0, upcoming: 0 },
    finance: { realizedEntries: 0, realizedExits: 0 }, customers: { total: 0, newInPeriod: 0 }, procedures: [],
    trends: { appointmentsPercent: null, receivedPercent: null, noShowRatePercent: null },
  };
  const previous = console.warn;
  let record;
  console.warn = (...args) => { record = args; };
  try {
    await assert.rejects(generateClinicSummary({ snapshot, model: "test/model", tenantHash: "opaque", generate: async () => {
      throw apiError(403, { responseBody: JSON.stringify({ error: {
        type: "patient_maria_silva_cpf_12345678900", message: "Authorization: Bearer fake-secret",
      } }) });
    } }), { message: "AI_UNAVAILABLE" });
  } finally {
    console.warn = previous;
  }
  assert.equal(record[1].aiGatewayErrorType, null);
  const serialized = JSON.stringify(record);
  for (const fragment of ["patient_maria", "fake-secret", "Authorization", "responseBody"]) {
    assert.equal(serialized.includes(fragment), false);
  }
});

test("rejects malicious types, invalid JSON, and unbounded cause chains", () => {
  const malicious = new GatewayInternalServerError({ cause: apiError(403, { responseBody: JSON.stringify({ error: {
    type: "Paciente Maria Authorization Bearer fake-secret", message: "Rua Ficticia CPF 000",
  } }) }) });
  assert.equal(extractSafeGatewayErrorCode(malicious), null);
  assert.equal(extractSafeGatewayErrorCode(new GatewayInternalServerError({ cause: apiError(403, { responseBody: "not JSON" }) })), null);
  const deep = apiError(403, { data: { error: { type: "access_denied" } } });
  const chain = new GatewayInternalServerError({ cause: new GatewayInternalServerError({ cause: new GatewayInternalServerError({ cause: new GatewayInternalServerError({ cause: deep }) }) }) });
  assert.equal(extractSafeGatewayErrorCode(chain), null);
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
  for (const fragment of ["Paciente Maria", "Rua Ficticia", "CPF 000", "Authorization", "Bearer", "fake-secret", "responseBody", "requestBodyValues", "responseHeaders", "headers", "cause", "stack", "message", "prompt", "payload"]) {
    assert.equal(serialized.includes(fragment), false, fragment);
  }
});

test("final log contains only the safe gateway code from a sensitive response", async () => {
  const snapshot = {
    period: { days: 30 },
    agenda: { total: 0, completed: 0, confirmed: 0, canceled: 0, noShows: 0, upcoming: 0 },
    finance: { realizedEntries: 0, realizedExits: 0 },
    customers: { total: 0, newInPeriod: 0 }, procedures: [],
    trends: { appointmentsPercent: null, receivedPercent: null, noShowRatePercent: null },
  };
  const previous = console.warn;
  let record;
  console.warn = (...args) => { record = args; };
  try {
    await assert.rejects(generateClinicSummary({ snapshot, model: "test/model", tenantHash: "opaque", generate: async () => {
      throw new GatewayInternalServerError({ statusCode: 403, cause: apiError(403, {
        responseBody: JSON.stringify({ error: {
          type: "access_denied", message: "Paciente Maria Authorization Bearer fake-secret Rua Ficticia CPF 000",
        } }),
      }) });
    } }), { message: "AI_UNAVAILABLE" });
  } finally {
    console.warn = previous;
  }
  assert.equal(record[1].aiGatewayErrorType, "access_denied");
  assert.equal(record[1].aiErrorCategory, "ACCESS_OR_ENTITLEMENT");
  const serialized = JSON.stringify(record);
  for (const fragment of ["Paciente Maria", "Rua Ficticia", "CPF", "Authorization", "Bearer", "fake-secret", "message", "responseBody", "requestBodyValues", "responseHeaders", "headers", "cause", "stack", "prompt", "payload"]) {
    assert.equal(serialized.includes(fragment), false, fragment);
  }
});
