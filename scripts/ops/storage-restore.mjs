import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { archiveFile, mainModule, requireValue, verifyArchive } from "./core.mjs";
import { assertRestoreConfirmation, assertSafeDrTarget, sha256 } from "../dr/safety.mjs";

const EXPECTED_BUCKETS = new Set(["cliente-fotos", "clinica-logos", "clinica-site-images"]);

function validateManifest(manifest, sourceRef) {
  if (manifest?.format !== "nexawi-ops-backup-v1" || manifest.sourceProjectRef !== sourceRef ||
      !Array.isArray(manifest.buckets) || !Array.isArray(manifest.files)) throw new Error("ops_restore_manifest_invalid");
  const bucketIds = new Set(manifest.buckets.map((bucket) => bucket.id));
  if (bucketIds.size !== manifest.buckets.length || [...EXPECTED_BUCKETS].some((id) => !bucketIds.has(id))) {
    throw new Error("ops_restore_buckets_invalid");
  }
  if (manifest.buckets.find((bucket) => bucket.id === "cliente-fotos")?.public !== false) {
    throw new Error("ops_restore_private_bucket_invalid");
  }
  const objects = manifest.files.filter((file) => file.storage).map((file) => ({ ...file.storage, file }));
  const unique = new Set();
  for (const object of objects) {
    if (!bucketIds.has(object.bucket) || typeof object.name !== "string" || !object.name ||
        object.name.startsWith("/") || object.name.includes("\\") || object.name.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("ops_restore_object_invalid");
    }
    const key = JSON.stringify([object.bucket, object.name]);
    if (unique.has(key)) throw new Error("ops_restore_duplicate_object");
    unique.add(key);
  }
  return objects;
}

async function objectExists(client, bucket, objectName) {
  const parts = objectName.split("/");
  const name = parts.pop();
  const folder = parts.join("/");
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from(bucket).list(folder, { limit: 100, offset, search: name });
    if (error || !Array.isArray(data)) throw new Error("ops_restore_conflict_check_failed");
    if (data.some((item) => item.name === name && item.id)) return true;
    if (data.length < 100) return false;
  }
}

export async function restoreStorageArchive(env, { clientFactory = createClient } = {}) {
  const targetRef = requireValue(env, "DR_PROJECT_REF");
  const sourceRef = requireValue(env, "DR_SOURCE_PROJECT_REF");
  const url = requireValue(env, "SUPABASE_URL");
  const archiveRoot = path.resolve(requireValue(env, "DR_ARCHIVE_DIR"));
  assertSafeDrTarget({ projectRef: targetRef, operation: "restore", supabaseUrl: url });
  assertRestoreConfirmation(targetRef, env.DR_CONFIRM_RESTORE);
  if (new URL(url).hostname !== `${targetRef}.supabase.co` && !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
    throw new Error("ops_restore_target_mismatch");
  }
  await verifyArchive(archiveRoot);
  const manifest = JSON.parse(await readFile(path.join(archiveRoot, "manifest.json"), "utf8"));
  const objects = validateManifest(manifest, sourceRef);
  const dryRun = env.DR_DRY_RUN === "true";
  const client = clientFactory(url, requireValue(env, "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: targetBuckets, error: bucketError } = await client.storage.listBuckets();
  if (bucketError || !Array.isArray(targetBuckets)) throw new Error("ops_restore_bucket_list_failed");
  const existingBucketIds = new Set(targetBuckets.map((bucket) => bucket.id));
  let createdBuckets = 0;
  for (const sourceBucket of manifest.buckets) {
    if (!EXPECTED_BUCKETS.has(sourceBucket.id)) continue;
    const existing = targetBuckets.find((bucket) => bucket.id === sourceBucket.id);
    if (existing && existing.public !== sourceBucket.public) throw new Error("ops_restore_bucket_visibility_mismatch");
    if (!existing && !dryRun) {
      const { error } = await client.storage.createBucket(sourceBucket.id, { public: sourceBucket.public });
      if (error) throw new Error("ops_restore_bucket_create_failed", { cause: error });
      createdBuckets += 1;
    }
  }
  let restored = 0;
  for (const object of objects) {
    const bytes = await readFile(archiveFile(archiveRoot, object.file.path));
    if (bytes.length !== object.file.bytes || sha256(bytes) !== object.file.sha256) throw new Error("ops_restore_object_hash_mismatch");
    if ((!dryRun || existingBucketIds.has(object.bucket)) && await objectExists(client, object.bucket, object.name)) {
      throw new Error("ops_restore_object_conflict");
    }
    if (dryRun) continue;
    const cacheDirective = String(object.metadata?.cacheControl || object.cache_control || "");
    const cacheSeconds = /^max-age=(\d+)$/.exec(cacheDirective)?.[1];
    const { error } = await client.storage.from(object.bucket).upload(object.name, bytes, {
      contentType: object.metadata?.mimetype || object.metadata?.mimeType || "application/octet-stream",
      ...(cacheSeconds ? { cacheControl: cacheSeconds } : {}),
      upsert: false,
    });
    if (error) throw new Error("ops_restore_upload_failed", { cause: error });
    const { data: readback, error: readbackError } = await client.storage.from(object.bucket).download(object.name);
    if (readbackError || !readback || sha256(Buffer.from(await readback.arrayBuffer())) !== object.file.sha256) {
      throw new Error("ops_restore_readback_mismatch");
    }
    restored += 1;
  }
  return { status: dryRun ? "validated_dry_run" : "storage_restored", sourceRef, targetRef, objects: objects.length, restored, createdBuckets };
}

if (mainModule(import.meta.url)) {
  process.umask(0o077);
  restoreStorageArchive(process.env).then((result) => console.log(JSON.stringify(result))).catch(() => {
    console.error(JSON.stringify({ status: "failed", code: "ops_storage_restore_failed" }));
    process.exitCode = 1;
  });
}
