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
  const retryable = (api || stream || gatewayName) && typeof source.isRetryable === "boolean" ? source.isRetryable : null;

  let category = "UNKNOWN";
  if (structured || (source instanceof Error && source.message === "AI_INVALID_OUTPUT")) category = "STRUCTURED_OUTPUT";
  else if (model || gatewayName === "GatewayModelNotFoundError" || code === "model_not_found") category = "MODEL";
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
  };
}
