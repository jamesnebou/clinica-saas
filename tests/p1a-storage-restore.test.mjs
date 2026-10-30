import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { restoreStorageArchive } from "../scripts/ops/storage-restore.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");

function fakeStorage() {
  const buckets = [];
  const objects = new Map();
  return { objects, client: { storage: {
    listBuckets: async () => ({ data: buckets, error: null }),
    createBucket: async (id, options) => { buckets.push({ id, public: options.public }); return { error: null }; },
    from: (bucket) => ({
      list: async (folder, { search }) => ({ data: [...objects.keys()].filter((key) => key.startsWith(`${bucket}/${folder ? `${folder}/` : ""}`) && key.endsWith(search)).map(() => ({ id: "fixture", name: search })), error: null }),
      upload: async (name, bytes, options) => {
        assert.equal(options.upsert, false);
        objects.set(`${bucket}/${name}`, Buffer.from(bytes));
        return { error: null };
      },
      download: async (name) => ({ data: new Blob([objects.get(`${bucket}/${name}`)]), error: null }),
    }),
  } } };
}

test("isolated Storage restore checks manifest, hashes, MIME and refuses second upload", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "p1a-storage-"));
  try {
    const bytes = Buffer.from("fixture-image");
    const filename = `${hash('photo-key')}.bin`;
    await mkdir(path.join(root, "storage"));
    await writeFile(path.join(root, "database.dump"), "fixture database");
    await writeFile(path.join(root, "roles.sql"), "fixture roles");
    await writeFile(path.join(root, "storage", filename), bytes);
    const files = [
      { path: "database.dump", bytes: 16, sha256: hash("fixture database") },
      { path: "roles.sql", bytes: 13, sha256: hash("fixture roles") },
      { path: `storage/${filename}`, bytes: bytes.length, sha256: hash(bytes), storage: { bucket: "cliente-fotos", name: "clinic/client/photo.png", metadata: { mimetype: "image/png" } } },
    ];
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({
      format: "nexawi-ops-backup-v1", sourceProjectRef: "source-ref", files,
      buckets: [{ id: "cliente-fotos", public: false }, { id: "clinica-logos", public: true }, { id: "clinica-site-images", public: true }],
    }));
    const { client, objects } = fakeStorage();
    const env = {
      DR_PROJECT_REF: "isolated-fixture", DR_SOURCE_PROJECT_REF: "source-ref",
      DR_ARCHIVE_DIR: root, DR_CONFIRM_RESTORE: "RESTORE:isolated-fixture",
      SUPABASE_URL: "http://127.0.0.1:55421", SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-key",
    };
    const factory = () => client;
    const dry = await restoreStorageArchive({ ...env, DR_DRY_RUN: "true" }, { clientFactory: factory });
    assert.equal(dry.restored, 0);
    assert.equal(objects.size, 0);
    const result = await restoreStorageArchive(env, { clientFactory: factory });
    assert.equal(result.restored, 1);
    assert.deepEqual(objects.get("cliente-fotos/clinic/client/photo.png"), bytes);
    await assert.rejects(restoreStorageArchive(env, { clientFactory: factory }), /ops_restore_object_conflict/);
    assert.deepEqual(objects.get("cliente-fotos/clinic/client/photo.png"), bytes);
    await writeFile(path.join(root, "storage", filename), "tampered");
    await assert.rejects(restoreStorageArchive(env, { clientFactory: factory }), /ops_archive_integrity_failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
