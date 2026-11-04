import { AISDKError, APICallError, NoObjectGeneratedError, NoSuchModelError, RetryError, StreamProviderError } from "ai";

const GATEWAY_ERROR_NAMES = new Set([
  "GatewayAuthenticationError", "GatewayForbiddenError", "GatewayInvalidRequestError",
  "GatewayRateLimitError", "GatewayModelNotFoundError", "GatewayNotFoundError",
  "GatewayInternalServerError", "GatewayFailedDependencyError", "GatewayResponseError", "GatewayTimeoutError",
]);
const PROVIDER_CODES = new Set([
  "insufficient_funds", "customer_verification_required", "quota_for_entity_exceeded",
  "model_not_found", "invalid_request_error",
]);
const SAFE_GATEWAY_CODE = /^[a-z][a-z0-9_]{0,63}$/;

function safeGatewayCode(value) {
  return typeof value === "string" && SAFE_GATEWAY_CODE.test(value) ? value : null;
}

function structuredGatewayCode(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const detail = value.error;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  return safeGatewayCode(detail.type) ?? safeGatewayCode(detail.code);
}

export function extractSafeGatewayErrorCode(error) {
  const seen = new Set();
  let current = error;
  for (let depth = 0; depth < 4 && current instanceof Error && !seen.has(current); depth += 1) {
    seen.add(current);
    if (APICallError.isInstance(current)) {
      let code = structuredGatewayCode(current.data);
      if (!code && typeof current.responseBody === "string" && current.responseBody.length <= 65536) {
        try {
          code = structuredGatewayCode(JSON.parse(current.responseBody));
        } catch {
          // Non-JSON responses carry no safe machine-readable code.
        }
      }
      if (code) return code;
    } else if (GATEWAY_ERROR_NAMES.has(current.name) || (AISDKError.isInstance(current) && current.name === "GatewayError")) {
      const code = safeGatewayCode(current.type) ?? safeGatewayCode(current.code);
      if (code && code !== "internal_server_error" && code !== "response_error") return code;
    }
    current = current.cause;
  }
  return null;
}

export function classifyAiGenerationError(error) {
  const source = RetryError.isInstance(error) && error.lastError ? error.lastError : error;
  const api = APICallError.isInstance(source);
  const stream = StreamProviderError.isInstance(source);
  const gatewayName = source instanceof Error && GATEWAY_ERROR_NAMES.has(source.name) ? source.name : null;
  const wrappedAuth = AISDKError.isInstance(source) && source.name === "GatewayError";
  const structured = NoObjectGeneratedError.isInstance(source);
  const model = NoSuchModelError.isInstance(source);
  const errorName = api ? "AI_APICallError" : stream ? "AI_StreamProviderError"
    : structured ? "AI_NoObjectGeneratedError" : model ? "AI_NoSuchModelError"
      : wrappedAuth ? "GatewayError" : gatewayName;
  const status = (api || stream || gatewayName) && Number.isInteger(source.statusCode) && source.statusCode >= 100 && source.statusCode <= 599
    ? source.statusCode : null;
  const code = stream && typeof source.code === "string" && PROVIDER_CODES.has(source.code) ? source.code : null;
  const gatewayType = extractSafeGatewayErrorCode(source);
  const retryable = (api || stream || gatewayName) && typeof source.isRetryable === "boolean" ? source.isRetryable : null;

  let category = "UNKNOWN";
  if (structured || (source instanceof Error && source.message === "AI_INVALID_OUTPUT")) category = "STRUCTURED_OUTPUT";
  else if (gatewayType === "access_denied" || gatewayType === "forbidden") category = "ACCESS_OR_ENTITLEMENT";
  else if (gatewayType === "customer_verification_required") category = "CUSTOMER_VERIFICATION";
  else if (gatewayType === "quota_for_entity_exceeded") category = "BUDGET";
  else if (gatewayType === "insufficient_funds") category = "PAYMENT_OR_CREDITS";
  else if (gatewayType === "no_providers_available") category = "MODEL_OR_PROVIDER_ACCESS";
  else if (model || gatewayName === "GatewayModelNotFoundError" || code === "model_not_found" || gatewayType === "model_not_found") category = "MODEL";
  else if (wrappedAuth || gatewayName === "GatewayAuthenticationError" || status === 401 || (status === 403 && !gatewayName)) category = "AUTH";
  else if (code === "quota_for_entity_exceeded") category = "BUDGET";
  else if (status === 402 || code === "insufficient_funds" || code === "customer_verification_required") category = "PAYMENT_OR_CREDITS";
  else if (gatewayName === "GatewayRateLimitError" || status === 429) category = "RATE_LIMIT";
  else if (gatewayName === "GatewayInvalidRequestError" || code === "invalid_request_error" || status === 400 || status === 422) category = "INVALID_REQUEST";
  else if (gatewayName === "GatewayTimeoutError" || (source instanceof Error && ["AbortError", "TimeoutError"].includes(source.name))) category = "NETWORK";
  else if (stream || gatewayName === "GatewayFailedDependencyError") category = "PROVIDER";

  return {
    aiErrorCategory: category,
    aiErrorName: errorName,
    aiStatusCode: status,
    aiProviderCode: code,
    aiRetryable: retryable,
    aiGatewayErrorType: gatewayType,
  };
}
