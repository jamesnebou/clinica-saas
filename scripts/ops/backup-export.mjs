import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { backupConfig, fileHash, integer, mainModule, retentionArgs, verifyArchive } from "./core.mjs";

// No child inherits unrelated application secrets; stderr is never relayed.
export function commandEnv(env, kind) {
  const keys = ["PATH", "SystemRoot", "HOME", "TMPDIR", "TMP", "TEMP"];
  keys.push(...(kind === "postgres"
    ? ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLROOTCERT", "PGSSLMODE"]
    : ["RESTIC_REPOSITORY", "RESTIC_PASSWORD", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_DEFAULT_REGION"]));
  const selected = Object.fromEntries(keys.filter((key) => env[key]).map((key) => [key, env[key]]));
  if (kind === "postgres") selected.PGOPTIONS = "-c default_transaction_read_only=on -c statement_timeout=1800000 -c lock_timeout=10000";
  return selected;
}

export function runCommand(program, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { ...options, shell: false, stdio: ["ignore", "pipe", "ignore"], timeout: 3_600_000, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.length > 8_000_000) child.kill();
    });
    child.on("error", () => reject(new Error("ops_backup_command_failed")));
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error("ops_backup_command_failed")));
  });
}

export async function storageCatalog(client, maxObjects = 100_000) {
  const buckets = [];
  const bucketIds = new Set();
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.listBuckets({ limit: 100, offset, sortColumn: "id", sortOrder: "asc" });
    if (error || !Array.isArray(data)) throw new Error("ops_bucket_list_failed");
    for (const bucket of data) {
      if (!bucket.id || bucketIds.has(bucket.id) || buckets.length >= 10_000) throw new Error("ops_bucket_catalog_invalid");
      bucketIds.add(bucket.id);
      buckets.push(bucket);
    }
    if (data.length < 100) break;
  }
  for (const id of ["cliente-fotos", "clinica-logos", "clinica-site-images"]) {
    if (!buckets.some((bucket) => bucket.id === id)) throw new Error("ops_required_bucket_missing");
  }
  if (buckets.find((bucket) => bucket.id === "cliente-fotos").public !== false) throw new Error("ops_private_bucket_exposed");
  const objects = [];
  let entries = 0;
  for (const bucket of buckets) {
    const pending = [""];
    const visited = new Set();
    while (pending.length) {
      const prefix = pending.pop();
      if (visited.has(prefix)) throw new Error("ops_storage_cycle");
      visited.add(prefix);
      for (let offset = 0; ; offset += 100) {
        const { data, error: listError } = await client.storage.from(bucket.id).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
        if (listError || !Array.isArray(data)) throw new Error("ops_object_list_failed");
        for (const item of data) {
          if (++entries > maxObjects || typeof item.name !== "string" || !item.name || item.name === "." || item.name === "..") throw new Error("ops_catalog_limit");
          const name = prefix ? `${prefix}/${item.name}` : item.name;
          if (!item.id) pending.push(name);
          else objects.push({ bucket: bucket.id, name, id: item.id, updated_at: item.updated_at, metadata: item.metadata });
        }
        if (data.length < 100) break;
      }
    }
  }
  objects.sort((a, b) => JSON.stringify([a.bucket, a.name]).localeCompare(JSON.stringify([b.bucket, b.name])));
  return { buckets: [...buckets].sort((a, b) => a.id.localeCompare(b.id)), objects };
}

export async function exportBackup(env, { run = runCommand, clientFactory = createClient } = {}) {
  const config = backupConfig(env);
  const pgEnv = commandEnv(env, "postgres");
  const resticEnv = commandEnv(env, "restic");
  const maxObjects = integer(env.OPS_BACKUP_MAX_OBJECTS, 100_000, 1, 1_000_000);
  const maxFileBytes = integer(env.OPS_BACKUP_MAX_FILE_BYTES, 67_108_864, 1, 268_435_456);
  // Prove repository is initialized BEFORE reading source data. Never init automatically.
  await run("restic", ["snapshots", "--json"], { env: resticEnv });
  const client = clientFactory(config.source, env.OPS_BACKUP_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(120_000) }) },
  });
  const startedAt = new Date().toISOString();
  const catalog = await storageCatalog(client, maxObjects);
  await mkdir(config.scratch, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(path.join(config.scratch, "nexawi-export-"));
  await mkdir(path.join(root, "storage"), { mode: 0o700 });
  // Full custom archive includes Auth, Storage metadata, RLS, functions and migration history.
  // Restore must use a reviewed TOC against a compatible isolated Supabase stack.
  await run("pg_dump", ["--no-password", "--format=custom", "--file", path.join(root, "database.dump")], { env: pgEnv });
  await run("pg_dumpall", ["--no-password", "--roles-only", "--no-role-passwords", "--file", path.join(root, "roles.sql")], { env: pgEnv });
  const files = [];
  for (const relative of ["database.dump", "roles.sql"]) {
    const filename = path.join(root, relative);
    const info = await stat(filename);
    if (!info.size) throw new Error("ops_empty_database_export");
    files.push({ path: relative, bytes: info.size, sha256: await fileHash(filename) });
  }
  for (const object of catalog.objects) {
    const expectedSize = Number(object.metadata?.size);
    if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > maxFileBytes) throw new Error("ops_storage_size_limit");
    const { data, error } = await client.storage.from(object.bucket).download(object.name);
    if (error || !data || data.size !== expectedSize) throw new Error("ops_storage_download_failed");
    const bytes = Buffer.from(await data.arrayBuffer());
    const filename = createHash("sha256").update(JSON.stringify([object.bucket, object.name])).digest("hex");
    const relative = `storage/${filename}.bin`;
    await writeFile(path.join(root, relative), bytes, { mode: 0o600, flag: "wx" });
    files.push({ path: relative, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), storage: object });
  }
  if (JSON.stringify(catalog) !== JSON.stringify(await storageCatalog(client, maxObjects))) throw new Error("ops_storage_changed_during_export");
  const manifest = {
    format: "nexawi-ops-backup-v1", sourceProjectRef: config.ref, startedAt, finishedAt: new Date().toISOString(),
    consistency: "operator-quiescence-acknowledged; database-snapshot-and-storage-not-atomic",
    buckets: catalog.buckets, files,
  };
  await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: "wx" });
  const verified = await verifyArchive(root);
  const result = await run("restic", ["backup", "--json", "--host", "nexawi-export", "--tag", `nexawi-ops:${config.ref}`, "."], { env: resticEnv, cwd: root });
  const summary = result.trim().split("\n").map((line) => JSON.parse(line)).findLast((item) => item.message_type === "summary");
  if (!/^[a-f0-9]{8,64}$/.test(summary?.snapshot_id || "")) throw new Error("ops_snapshot_unconfirmed");
  const snapshots = JSON.parse(await run("restic", ["snapshots", "--json", summary.snapshot_id], { env: resticEnv }));
  if (!snapshots.some((snapshot) => snapshot.id.startsWith(summary.snapshot_id))) throw new Error("ops_snapshot_unconfirmed");
  await run("restic", ["check"], { env: resticEnv });
  await run("restic", retentionArgs(config.ref), { env: resticEnv });
  // No paths, object names, SQL, identities or credentials in the operational result.
  return { status: "export_verified", ...verified, snapshot: summary.snapshot_id, physicalReadback: "pending_isolated_restore" };
}

if (mainModule(import.meta.url)) {
  process.umask(0o077);
  exportBackup(process.env).then((result) => console.log(JSON.stringify(result))).catch(() => {
    console.error(JSON.stringify({ status: "failed", code: "ops_backup_failed", action: "inspect_protected_runner_and_source_without_publishing_logs" }));
    process.exitCode = 1;
  });
}
