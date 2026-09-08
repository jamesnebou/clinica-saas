import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canAccessProntuario } from "../src/lib/auth/permissions.js";

const migrationUrl = new URL("../supabase/migrations/20260907130000_prontuario_seguro_rls.sql", import.meta.url);

test("prontuario exige capability explicita para profissionais e nega papeis administrativos", () => {
  assert.equal(canAccessProntuario({ papel: "owner", permissoes: {} }), true);
  assert.equal(canAccessProntuario({ papel: "admin", permissoes: {} }), true);
  assert.equal(canAccessProntuario({ papel: "admin", permissoes: { secoes: ["clientes"] } }), false);
  assert.equal(canAccessProntuario({ papel: "profissional", permissoes: {} }), false);
  assert.equal(canAccessProntuario({ papel: "profissional", permissoes: { secoes: ["clientes", "prontuario"] } }), true);
  assert.equal(canAccessProntuario({ papel: "recepcao", permissoes: { secoes: ["clientes", "prontuario"] } }), false);
  assert.equal(canAccessProntuario({ papel: "financeiro", permissoes: { secoes: ["clientes", "prontuario"] } }), false);
});

test("fix-forward separa prontuario, preserva legado e aplica RLS deny-by-default", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create table if not exists public\.cliente_prontuarios/i);
  assert.match(sql, /insert into public\.cliente_prontuarios[\s\S]*from public\.clientes[\s\S]*on conflict \(clinica_id, cliente_id\) do nothing/i);
  assert.match(sql, /foreign key \(clinica_id, cliente_id\)[\s\S]*references public\.clientes\(clinica_id, id\)/i);
  assert.match(sql, /alter table public\.cliente_prontuarios enable row level security/i);
  assert.match(sql, /usuario_prontuario_clinica\(clinica_id\)/i);
  assert.match(sql, /revoke select, insert, update, delete on public\.clientes from authenticated/i);
  assert.doesNotMatch(sql.match(/grant select \([\s\S]*?\) on public\.clientes to authenticated/i)?.[0] || "", /anamnese|alergias|medicamentos_uso|observacoes_clinicas/i);
  assert.match(sql, /sync_cliente_legacy_to_prontuario/i);
  assert.match(sql, /sync_prontuario_to_cliente_legacy/i);
});

test("aplicacao usa superficie clinica separada e projecoes cadastrais explicitas", async () => {
  const [page, actions, list] = await Promise.all([
    readFile(new URL("../src/app/dashboard/clientes/[id]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../src/app/dashboard/actions.js", import.meta.url), "utf8"),
    readFile(new URL("../src/app/dashboard/clientes/page.js", import.meta.url), "utf8"),
  ]);

  assert.match(page, /from\("cliente_prontuarios"\)/);
  assert.doesNotMatch(page, /from\("clientes"\)\.select\("\*"\)/);
  assert.match(actions, /canAccessProntuario\(membership\)/);
  assert.match(actions, /from\("cliente_prontuarios"\)/);
  assert.doesNotMatch(list.match(/from\("clientes"\)[\s\S]*?\.order\(/)?.[0] || "", /anamnese|alergias|retorno_recomendado_em|termo_consentimento_aceito/);
});

test("anexos permanecem privados e URLs assinadas exigem prefixo do tenant e cliente", async () => {
  const [storageMigration, storageService] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260618162000_storage_financeiro_basico.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/supabase/storage.js", import.meta.url), "utf8"),
  ]);

  assert.match(storageMigration, /'cliente-fotos',[\s\S]*?false,[\s\S]*?array\['image\/jpeg', 'image\/png', 'image\/webp'\]/i);
  assert.match(storageService, /expectedPrefix = clinicaId && clienteId \? `\$\{clinicaId\}\/\$\{clienteId\}\//);
  const signedPhotoFunction = storageService.slice(storageService.indexOf("export async function createSignedPhotoUrl"));
  assert.match(signedPhotoFunction, /from\(CLIENT_PHOTOS_BUCKET\)[\s\S]*createSignedUrl\(storagePath, 60 \* 60\)/);
  assert.doesNotMatch(signedPhotoFunction, /getPublicUrl/);
});
