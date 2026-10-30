import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { drillStagingStorageFixture } from "../scripts/ops/storage-fixture-drill.mjs";

test("staging drill uses only its synthetic path and verifies backup/restore", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "p1a-fixture-"));
  const objects = new Map([["real-clinic/real-client/photo.jpg", Buffer.from("untouched")]]);
  const calls = [];
  const client = { storage: { from(bucket) {
    assert.equal(bucket, "cliente-fotos");
    return {
      upload: async (name, bytes, options) => {
        assert.match(name, /^p1a-dr-fixture\/[0-9a-f-]{36}\.png$/);
        assert.equal(options.contentType, "image/png");
        assert.equal(options.upsert, false);
        calls.push("upload");
        if (objects.has(name)) return { error: new Error("conflict") };
        objects.set(name, Buffer.from(bytes));
        return { error: null };
      },
      download: async (name) => ({ data: objects.has(name) ? new Blob([objects.get(name)]) : null, error: objects.has(name) ? null : new Error("not found") }),
      list: async (_folder, { search }) => ({ data: [...objects.keys()].filter((key) => key.endsWith(search)).map(() => ({ name: search, id: "fixture" })), error: null }),
      remove: async ([name]) => { assert.match(name, /^p1a-dr-fixture\//); calls.push("remove"); objects.delete(name); return { error: null }; },
    };
  } } };
  try {
    const env = {
      P1A_STAGING_SUPABASE_URL: "https://ojmszqqxnvmvudhzzzgo.supabase.co",
      P1A_STAGING_CONFIRM: "STAGING_FIXTURE_ONLY:ojmszqqxnvmvudhzzzgo",
      P1A_STAGING_SERVICE_ROLE_KEY: "synthetic-key", P1A_DR_ARCHIVE_ROOT: root,
    };
    await assert.rejects(drillStagingStorageFixture({ ...env, P1A_STAGING_SUPABASE_URL: "https://sitoiwxalwfybcqivutd.supabase.co" }, { clientFactory: () => client }), /target_invalid/);
    const result = await drillStagingStorageFixture(env, { clientFactory: () => client });
    assert.equal(result.status, "fixture_restored_and_cleaned");
    assert.equal(result.sha256Before, result.sha256After);
    assert.equal(objects.size, 1);
    assert.equal(objects.get("real-clinic/real-client/photo.jpg").toString(), "untouched");
    assert.deepEqual(calls, ["upload", "remove", "upload", "remove"]);
    const saved = await readFile(path.join(result.archive, "object.bin"));
    assert.equal(createHash("sha256").update(saved).digest("hex"), result.sha256Before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
