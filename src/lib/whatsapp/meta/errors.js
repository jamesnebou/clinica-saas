export class MetaCloudError extends Error {
  constructor(
    message,
    {
      status = 500,
      code = null,
      subcode = null,
      transient = false,
      details = null,
      userTitle = null,
      userMessage = null,
    } = {}
  ) {
    super(message);

    this.name = "MetaCloudError";
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.transient = transient;
    this.details = details;
    this.userTitle = userTitle;
    this.userMessage = userMessage;
  }
}
export function sanitizeMetaError(error) {
  const code = error?.code ? ` (${error.code})` : "";
  const subcode = error?.subcode ? ` [subcode ${error.subcode}]` : "";

  const parts = [
    error?.message,
    error?.details,
    error?.userMessage,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim());

  const message = [...new Set(parts)]
    .join(" — ")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/\bEAA[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .replace(/\b\d{5,}\|[A-Za-z0-9._~-]{8,}\b/g, "[redacted]")
    .slice(0, 700);

  return `${message || "Falha na comunicação com a Meta"}${code}${subcode}`;
}
