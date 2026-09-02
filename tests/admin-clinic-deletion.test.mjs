import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("clinic deletion requires internal admin and validates before side effects", async () => {
  const source = await read("src/app/admin/actions.js");
  const action = source.slice(source.indexOf("export async function deleteClinicAction"));

  assert.ok(action.indexOf("requireInternalAdmin()") < action.indexOf("admin_delete_clinic_v1"));
  assert.ok(action.indexOf("p_execute: false") < action.indexOf("removeAsaasSubscription"));
  assert.ok(action.includes("p_execute: true"));
  assert.ok(action.includes('deletionScope === "full"'));
  assert.ok(action.includes("auth.admin.deleteUser"));
  assert.ok(action.includes("userId === adminUser.id"));
  assert.ok(action.includes("(count || 0) === 0"));
  assert.ok(action.includes("isInternalAdminUser(authData?.user)"));
});

test("database deletion is service-role only and protects the official demo", async () => {
  const source = await read("supabase/migrations/20260902120000_admin_delete_clinic.sql");

  assert.match(source, /security definer/i);
  assert.match(source, /DEMO_CLINIC_PROTECTED/);
  assert.match(source, /CLINIC_CONFIRMATION_MISMATCH/);
  assert.match(source, /delete from public\.clinicas/i);
  assert.match(source, /revoke all .* authenticated/i);
  assert.match(source, /grant execute .* service_role/i);
});

test("admin UI offers scoped and full deletion with two confirmations", async () => {
  const source = await read("src/app/dashboard-admin/clinicas/clinic-delete-form.js");

  assert.match(source, /Somente do sistema/);
  assert.match(source, /Exclusão geral/);
  assert.match(source, /name="confirm_name"/);
  assert.match(source, /window\.confirm/);
});

test("clinic file cleanup covers every tenant storage bucket", async () => {
  const source = await read("src/lib/supabase/storage.js");

  assert.match(source, /cliente-fotos/);
  assert.match(source, /clinica-logos/);
  assert.match(source, /clinica-site-images/);
  assert.match(source, /removeClinicStorage/);
});
