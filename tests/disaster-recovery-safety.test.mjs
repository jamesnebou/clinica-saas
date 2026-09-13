import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  assertRestoreConfirmation,
  assertSafeDrTarget,
  safeArchivePath,
  sha256,
} from "../scripts/dr/safety.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("scripts DR bloqueiam production e staging", () => {
  for (const projectRef of [PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF]) {
    assert.throws(() => assertSafeDrTarget({ projectRef, operation: "restore", supabaseUrl: "http://127.0.0.1:55421" }), /protegido/);
  }
});

test("target ausente falha fechado", () => {
  assert.throws(() => assertSafeDrTarget({ projectRef: "", operation: "backup", supabaseUrl: "http://127.0.0.1:55421" }), /obrigatório/);
});

test("restore exige confirmação vinculada ao ref", () => {
  assert.throws(() => assertRestoreConfirmation("dr-local", "RESTORE:outro"), /Confirmação/);
  assert.doesNotThrow(() => assertRestoreConfirmation("dr-local", "RESTORE:dr-local"));
});

test("alvo remoto exige confirmação de isolamento", () => {
  const previous = process.env.DR_ISOLATED_REMOTE_CONFIRM;
  delete process.env.DR_ISOLATED_REMOTE_CONFIRM;
  assert.throws(() => assertSafeDrTarget({ projectRef: "isolated-ref", operation: "backup", supabaseUrl: "https://isolated-ref.supabase.co" }), /não foi confirmado/);
  process.env.DR_ISOLATED_REMOTE_CONFIRM = "ISOLATED:isolated-ref";
  assert.equal(assertSafeDrTarget({ projectRef: "isolated-ref", operation: "backup", supabaseUrl: "https://isolated-ref.supabase.co" }).local, false);
  if (previous === undefined) delete process.env.DR_ISOLATED_REMOTE_CONFIRM;
  else process.env.DR_ISOLATED_REMOTE_CONFIRM = previous;
});

test("path traversal e caminhos absolutos são bloqueados", () => {
  assert.throws(() => safeArchivePath("C:/tmp/dr", "cliente-fotos", "../../secret"), /inválido|traversal/);
  assert.throws(() => safeArchivePath("C:/tmp/dr", "cliente-fotos", "C:/secret"), /absoluto|traversal/);
  assert.match(safeArchivePath("C:/tmp/dr", "cliente-fotos", "tenant/client/photo.png"), /photo\.png$/);
});

test("hash mismatch interrompe restore e overwrite permanece desabilitado", () => {
  const source = read("scripts/dr/storage-archive.mjs");
  assert.match(source, /Hash SHA-256 divergente/);
  assert.match(source, /objeto de destino já existe/);
  assert.match(source, /upsert:\s*false/);
  assert.notEqual(sha256(Buffer.from("a")), sha256(Buffer.from("b")));
});

test("scripts não imprimem secrets nem versionam senha da fixture", () => {
  const storage = read("scripts/dr/storage-archive.mjs");
  const lab = read("scripts/dr/local-lab.mjs");
  assert.doesNotMatch(storage, /console\.log\([^\n]*(serviceRoleKey|SERVICE_ROLE_KEY)/);
  assert.match(storage, /required\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.doesNotMatch(lab, /console\.log\([^\n]*(password|serviceRoleKey|SERVICE_ROLE_KEY)/);
  assert.match(lab, /required\("DR_TEST_PASSWORD"\)/);
  assert.doesNotMatch(lab, /password:\s*["'][^"']+["']/);
});

test("Storage privado e hashes são validados após restore", () => {
  const source = read("scripts/dr/local-lab.mjs");
  assert.match(source, /Bucket privado permitiu download anônimo/);
  assert.match(source, /createSignedUrl/);
  assert.match(source, /Hash de Storage divergente/);
  assert.match(source, /Integridade do restore diverge/);
});
