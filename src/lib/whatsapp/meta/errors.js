export class MetaCloudError extends Error {
  constructor(message, { status = 500, code = null, subcode = null, transient = false } = {}) {
    super(message); this.name = "MetaCloudError"; this.status = status; this.code = code; this.subcode = subcode; this.transient = transient;
  }
}
export function sanitizeMetaError(error) {
  const code = error?.code ? ` (${error.code})` : "";
  const message = String(error?.message || "Falha na comunicação com a Meta")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/\bEAA[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .replace(/\b\d{5,}\|[A-Za-z0-9._~-]{8,}\b/g, "[redacted]")
    .slice(0, 350);
  return `${message}${code}`;
}
