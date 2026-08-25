export class MetaCloudError extends Error {
  constructor(message, { status = 500, code = null, subcode = null, transient = false } = {}) {
    super(message); this.name = "MetaCloudError"; this.status = status; this.code = code; this.subcode = subcode; this.transient = transient;
  }
}
export function sanitizeMetaError(error) {
  const code = error?.code ? ` (${error.code})` : "";
  return `${String(error?.message || "Falha na comunicação com a Meta").slice(0, 350)}${code}`;
}

