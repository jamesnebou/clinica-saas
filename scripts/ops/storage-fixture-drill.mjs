import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { mainModule, requireValue } from "./core.mjs";

const STAGING_REF = "ojmszqqxnvmvudhzzzgo";
const BUCKET = "cliente-fotos";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function drillStagingStorageFixture(env, { clientFactory = createClient } = {}) {
  const url = new URL(requireValue(env, "P1A_STAGING_SUPABASE_URL"));
  if (url.href !== `https://${STAGING_REF}.supabase.co/` ||
      env.P1A_STAGING_CONFIRM !== `STAGING_FIXTURE_ONLY:${STAGING_REF}`) {
    throw new Error("p1a_staging_fixture_target_invalid");
  }
  const root = path.resolve(requireValue(env, "P1A_DR_ARCHIVE_ROOT"));
  const client = clientFactory(url.origin, requireValue(env, "P1A_STAGING_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const id = randomUUID();
  const objectPath = `p1a-dr-fixture/${id}.png`;
  const contents = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const expectedHash = digest(contents);
  const archive = path.join(root, id);
  await mkdir(archive, { recursive: false, mode: 0o700 });
  const storage = client.storage.from(BUCKET);
  const { error: uploadError } = await storage.upload(objectPath, contents, { contentType: "image/png", upsert: false });
  if (uploadError) throw new Error("p1a_fixture_upload_failed", { cause: uploadError });
  const { data: original, error: readError } = await storage.download(objectPath);
  if (readError || !original) throw new Error("p1a_fixture_read_failed");
  const backedUp = Buffer.from(await original.arrayBuffer());
  if (digest(backedUp) !== expectedHash) throw new Error("p1a_fixture_backup_hash_mismatch");
  await writeFile(path.join(archive, "object.bin"), backedUp, { flag: "wx", mode: 0o600 });
  await writeFile(path.join(archive, "manifest.json"), JSON.stringify({
    format: "p1a-storage-fixture-v1", projectRef: STAGING_REF, bucket: BUCKET, path: objectPath,
    bytes: backedUp.length, sha256: expectedHash, createdAt: new Date().toISOString(),
  }, null, 2), { flag: "wx", mode: 0o600 });

  const { error: removalError } = await storage.remove([objectPath]);
  if (removalError) throw new Error("p1a_fixture_remove_failed", { cause: removalError });
  const { data: afterRemoval, error: listError } = await storage.list("p1a-dr-fixture", { search: `${id}.png`, limit: 100 });
  if (listError || !Array.isArray(afterRemoval)) throw new Error("p1a_fixture_removal_check_failed");
  if (afterRemoval.some((item) => item.name === `${id}.png`)) throw new Error("p1a_fixture_still_exists");
  const { error: restoreError } = await storage.upload(objectPath, backedUp, { contentType: "image/png", upsert: false });
  if (restoreError) throw new Error("p1a_fixture_restore_failed", { cause: restoreError });
  const { data: restored, error: verifyError } = await storage.download(objectPath);
  if (verifyError || !restored || digest(Buffer.from(await restored.arrayBuffer())) !== expectedHash) {
    throw new Error("p1a_fixture_restore_hash_mismatch");
  }
  const { error: cleanupError } = await storage.remove([objectPath]);
  if (cleanupError) throw new Error("p1a_fixture_cleanup_failed", { cause: cleanupError });
  return { status: "fixture_restored_and_cleaned", projectRef: STAGING_REF, bucket: BUCKET,
    path: objectPath, bytes: backedUp.length, sha256Before: expectedHash, sha256After: expectedHash,
    archive };
}

if (mainModule(import.meta.url)) {
  process.umask(0o077);
  drillStagingStorageFixture(process.env).then((result) => console.log(JSON.stringify(result))).catch(() => {
    console.error(JSON.stringify({ status: "failed", code: "p1a_storage_fixture_failed" }));
    process.exitCode = 1;
  });
}
