import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertRestoreConfirmation, assertSafeDrTarget, safeArchivePath, sha256 } from "./safety.mjs";

const BUCKETS = Object.freeze(["cliente-fotos", "clinica-logos", "clinica-site-images"]);

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} é obrigatório.`);
  return value;
}

async function listObjects(client, bucket, prefix = "") {
  const output = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    for (const item of data || []) {
      const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) output.push(objectPath);
      else output.push(...await listObjects(client, bucket, objectPath));
    }
    if ((data || []).length < 100) break;
  }
  return output;
}

async function backup(client, archiveRoot, projectRef, dryRun) {
  const existing = await readdir(archiveRoot).catch(() => []);
  if (existing.length) throw new Error("O diretório de backup precisa estar vazio.");
  const objects = [];

  for (const bucket of BUCKETS) {
    for (const objectPath of await listObjects(client, bucket)) {
      if (dryRun) {
        objects.push({ bucket, path: objectPath, dryRun: true });
        continue;
      }
      const { data, error } = await client.storage.from(bucket).download(objectPath);
      if (error) throw error;
      const bytes = Buffer.from(await data.arrayBuffer());
      const target = safeArchivePath(path.join(archiveRoot, "objects"), bucket, objectPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
      objects.push({ bucket, path: objectPath, bytes: bytes.length, sha256: sha256(bytes) });
    }
  }

  if (!dryRun) {
    await writeFile(path.join(archiveRoot, "storage-manifest.json"), `${JSON.stringify({
      format: 1,
      sourceProjectRef: projectRef,
      createdAt: new Date().toISOString(),
      objects,
    }, null, 2)}\n`, { flag: "wx" });
  }
  return { operation: "backup", dryRun, buckets: BUCKETS.length, objects: objects.length };
}

async function restore(client, archiveRoot, projectRef, dryRun) {
  assertRestoreConfirmation(projectRef, process.env.DR_CONFIRM_RESTORE);
  const manifest = JSON.parse(await readFile(path.join(archiveRoot, "storage-manifest.json"), "utf8"));
  if (manifest?.format !== 1 || !Array.isArray(manifest.objects)) throw new Error("Manifesto de Storage inválido.");

  let restored = 0;
  for (const item of manifest.objects) {
    if (!BUCKETS.includes(item.bucket)) throw new Error("Bucket não permitido no manifesto.");
    const source = safeArchivePath(path.join(archiveRoot, "objects"), item.bucket, item.path);
    const bytes = await readFile(source);
    if (sha256(bytes) !== item.sha256) throw new Error("Hash SHA-256 divergente; restore interrompido.");
    if (dryRun) continue;

    const { data: existing } = await client.storage.from(item.bucket).download(item.path);
    if (existing) throw new Error("Restore recusado porque o objeto de destino já existe.");
    const { error } = await client.storage.from(item.bucket).upload(item.path, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    if (error) throw error;
    restored += 1;
  }
  return { operation: "restore", dryRun, objects: manifest.objects.length, restored };
}

const operation = process.argv[2];
if (!["backup", "restore"].includes(operation)) throw new Error("Use backup ou restore.");
const supabaseUrl = required("SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const projectRef = required("DR_PROJECT_REF");
const archiveRoot = path.resolve(required("DR_ARCHIVE_DIR"));
const dryRun = process.env.DR_DRY_RUN === "true";
assertSafeDrTarget({ projectRef, operation, supabaseUrl });
await mkdir(archiveRoot, { recursive: true });

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const result = operation === "backup"
  ? await backup(client, archiveRoot, projectRef, dryRun)
  : await restore(client, archiveRoot, projectRef, dryRun);
console.log(JSON.stringify(result));
