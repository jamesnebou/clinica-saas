import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function requireValue(env, key) {
  if (typeof env[key] !== "string" || !env[key].trim()) throw new Error("ops_configuration_missing");
  return env[key];
}

export function integer(value, fallback, min, max) {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error("ops_invalid_limit");
  return result;
}

export function mainModule(url) {
  return Boolean(process.argv[1] && url === pathToFileURL(path.resolve(process.argv[1])).href);
}

export function localBenchmarkTarget(env) {
  const url = new URL(requireValue(env, "OPS_LOCAL_SUPABASE_URL"));
  if (url.origin !== "http://127.0.0.1:55421" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("ops_benchmark_local_only");
  }
  if (env.OPS_LOCAL_CONFIRM !== "LOCAL:clinica-estetica") throw new Error("ops_local_confirmation_required");
  return url.origin;
}

export function stagingTarget(env) {
  const url = new URL(requireValue(env, "STAGING_BASE_URL"));
  // A single explicit staging domain, not any arbitrary *.vercel.app deployment.
  if (url.origin !== "https://staging.clinicas.nexawi.com.br" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("ops_smoke_staging_only");
  }
  if (env.OPS_STAGING_CONFIRM !== "STAGING:ojmszqqxnvmvudhzzzgo") throw new Error("ops_staging_confirmation_required");
  return url.origin;
}

export function backupConfig(env) {
  if (env.OPS_BACKUP_ENABLED !== "true") throw new Error("ops_backup_disabled");
  const ref = requireValue(env, "OPS_BACKUP_SOURCE_REF");
  if (!/^[a-z]{20}$/.test(ref) || env.OPS_BACKUP_CONFIRM !== `READ_ONLY_EXPORT:${ref}`) throw new Error("ops_backup_confirmation_required");
  if (env.OPS_BACKUP_QUIESCENCE_ACK !== "WRITES_PAUSED_EXTERNALLY") throw new Error("ops_backup_consistency_ack_required");
  const source = new URL(requireValue(env, "OPS_BACKUP_SUPABASE_URL"));
  if (source.href !== `https://${ref}.supabase.co/`) throw new Error("ops_backup_source_mismatch");
  // Direct database only: no ambiguous pooler target or user-controlled DSN.
  if (env.PGHOST !== `db.${ref}.supabase.co` || env.PGDATABASE !== "postgres"
      || env.PGPORT !== "5432" || env.PGSSLMODE !== "verify-full") throw new Error("ops_backup_database_mismatch");
  for (const key of ["PGUSER", "PGPASSWORD", "PGSSLROOTCERT", "OPS_BACKUP_SERVICE_ROLE_KEY", "RESTIC_PASSWORD", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) requireValue(env, key);
  const repository = requireValue(env, "RESTIC_REPOSITORY");
  if (!repository.startsWith("s3:https://")) throw new Error("ops_external_tls_repository_required");
  const target = new URL(repository.slice(3));
  if (target.username || target.password || target.search || target.hash || target.pathname === "/"
      || target.hostname.endsWith(".supabase.co") || target.hostname === source.hostname
      || target.hostname !== requireValue(env, "OPS_BACKUP_DESTINATION_HOST")) throw new Error("ops_backup_destination_invalid");
  if (env.OPS_BACKUP_SECURE_SCRATCH_ACK !== "EPHEMERAL_ENCRYPTED_VOLUME") throw new Error("ops_secure_scratch_required");
  const scratch = requireValue(env, "OPS_BACKUP_SCRATCH");
  if (!path.isAbsolute(scratch)) throw new Error("ops_scratch_absolute_required");
  return { ref, source: source.origin, scratch, repository };
}

export async function fileHash(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

export function archiveFile(root, relative) {
  // Archive file names are opaque, never Storage names supplied by a patient.
  if (!/^(database\.dump|roles\.sql|storage\/[0-9a-f]{64}\.bin)$/.test(relative)) throw new Error("ops_archive_path_invalid");
  return path.join(root, ...relative.split("/"));
}

export async function verifyArchive(root) {
  const manifestInfo = await lstat(path.join(root, "manifest.json"));
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.size > 100 * 1024 * 1024) throw new Error("ops_manifest_invalid");
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
  if (manifest.format !== "nexawi-ops-backup-v1" || !Array.isArray(manifest.files)
      || !manifest.files.some((file) => file.path === "database.dump")
      || !manifest.files.some((file) => file.path === "roles.sql")) throw new Error("ops_manifest_invalid");
  const seen = new Set();
  for (const file of manifest.files) {
    if (seen.has(file.path)) throw new Error("ops_duplicate_archive_file");
    seen.add(file.path);
    const filename = archiveFile(root, file.path);
    if (file.path.startsWith("storage/")) {
      const parent = await lstat(path.join(root, "storage"));
      if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error("ops_archive_symlink");
    }
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== file.bytes || await fileHash(filename) !== file.sha256) throw new Error("ops_archive_integrity_failed");
  }
  return { files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0) };
}

export function retentionArgs(ref) {
  if (!/^[a-z]{20}$/.test(ref)) throw new Error("ops_invalid_ref");
  // Planning only; deletion/prune is deliberately not available through this tool.
  return ["forget", "--dry-run", "--tag", `nexawi-ops:${ref}`, "--group-by", "host,tags", "--keep-daily", "14", "--keep-weekly", "8", "--keep-monthly", "12"];
}
