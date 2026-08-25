import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/20260826100000_whatsapp_meta_official.sql", import.meta.url);

test("migration do WhatsApp mantém isolamento, idempotência e lock concorrente", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /clinica_id uuid not null references public\.clinicas/i);
  assert.match(sql, /idempotency_key text not null unique/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /usuario_tem_acesso_clinica\(clinica_id\)/i);
  assert.match(sql, /usuario_admin_clinica\(clinica_id\)/i);
  assert.match(sql, /drop policy if exists whatsapp_connections_select_members/i);
  assert.match(sql, /revoke all on function public\.claim_notification_jobs/i);
  assert.match(sql, /grant execute on function public\.claim_notification_jobs[^;]+to service_role/i);
});

test("migration não persiste token interativo em texto aberto", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /token_hash text not null unique/i);
  assert.doesNotMatch(sql, /\baccess_token\b/i);
});

test("migration indexa telefone normalizado por clínica", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /generated always as \(app_private\.normalize_whatsapp_phone\(telefone\)\) stored/i);
  assert.match(sql, /clientes\(clinica_id, telefone_whatsapp\)/i);
});
