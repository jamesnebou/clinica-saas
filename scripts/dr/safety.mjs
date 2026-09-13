import { createHash } from "node:crypto";
import path from "node:path";

export const PRODUCTION_PROJECT_REF = "sitoiwxalwfybcqivutd";
export const STAGING_PROJECT_REF = "ojmszqqxnvmvudhzzzgo";

const BLOCKED_REFS = new Set([PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF]);

export function assertSafeDrTarget({ projectRef, operation, supabaseUrl }) {
  const ref = String(projectRef || "").trim();
  if (!ref) throw new Error("DR_PROJECT_REF é obrigatório.");
  if (BLOCKED_REFS.has(ref)) throw new Error("O alvo informado é protegido e não pode ser usado por scripts de DR.");
  if (!operation) throw new Error("A operação de DR deve ser explícita.");

  const url = new URL(String(supabaseUrl || ""));
  const local = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  const isolatedConfirmed = process.env.DR_ISOLATED_REMOTE_CONFIRM === `ISOLATED:${ref}`;
  if (!local && !isolatedConfirmed) {
    throw new Error("Alvo remoto isolado não foi confirmado explicitamente.");
  }
  return { ref, local };
}

export function assertRestoreConfirmation(projectRef, confirmation) {
  if (confirmation !== `RESTORE:${projectRef}`) {
    throw new Error("Confirmação explícita de restore ausente ou incorreta.");
  }
}

export function safeArchivePath(root, bucket, objectPath) {
  const normalizedBucket = String(bucket || "").replaceAll("\\", "/");
  const normalizedObject = String(objectPath || "").replaceAll("\\", "/");
  if (!normalizedBucket || !normalizedObject || normalizedBucket.includes("..") || normalizedObject.split("/").includes("..")) {
    throw new Error("Caminho de Storage inválido.");
  }
  if (path.isAbsolute(normalizedBucket) || path.isAbsolute(normalizedObject)) {
    throw new Error("Caminho absoluto de Storage não é permitido.");
  }

  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, normalizedBucket, ...normalizedObject.split("/"));
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error("Path traversal bloqueado no arquivo de Storage.");
  }
  return target;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
