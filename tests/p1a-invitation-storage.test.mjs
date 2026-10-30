import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canAcceptStaffInvitation } from "../src/lib/auth/staff-invitation.mjs";
import { isOwnedClientPhotoPath } from "../src/lib/supabase/client-photo-path.mjs";

const now = new Date("2026-10-27T12:00:00Z");
const user = { id: "user-a", email: "staff@example.test" };
const invitation = { user_id: "user-a", email: "staff@example.test", ativo: false, accepted_at: null, invite_expires_at: "2026-10-28T12:00:00Z" };

test("staff invitation requires matching user and email before expiration", () => {
  assert.equal(canAcceptStaffInvitation(invitation, user, now), true);
  assert.equal(canAcceptStaffInvitation(invitation, { ...user, id: "user-b" }, now), false);
  assert.equal(canAcceptStaffInvitation(invitation, { ...user, email: "other@example.test" }, now), false);
  assert.equal(canAcceptStaffInvitation({ ...invitation, ativo: true }, user, now), false);
  assert.equal(canAcceptStaffInvitation({ ...invitation, accepted_at: now.toISOString() }, user, now), false);
  assert.equal(canAcceptStaffInvitation({ ...invitation, invite_expires_at: now.toISOString() }, user, now), false);
});

test("invite creation never asks manager for a password and activation is conditional", async () => {
  const actions = await readFile(new URL("../src/app/dashboard/actions.js", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/app/dashboard/usuarios/page.js", import.meta.url), "utf8");
  const acceptance = await readFile(new URL("../src/app/convite/actions.js", import.meta.url), "utf8");
  assert.doesNotMatch(page, /senha_temporaria|Senha temporária/);
  assert.doesNotMatch(actions, /upsertAuthUserWithPassword|senha_temporaria/);
  assert.match(actions, /ativo: false/);
  assert.match(actions, /invite_expires_at/);
  assert.match(actions, /existingMembership\?\.id \? existingMembership\.invite_requires_password : !existingAuthUser/);
  assert.match(actions, /existing\.accepted_at/);
  assert.match(acceptance, /verifyOtp/);
  assert.match(acceptance, /eq\("clinica_id", membership\.clinica_id\)/);
  assert.match(acceptance, /eq\("user_id", user\.id\)/);
  assert.match(acceptance, /assertClinicLimit\(\{ clinic, resource: "usuarios" \}\)/);
  const migration = await readFile(new URL("../supabase/migrations/20261027194500_staff_invitation_state.sql", import.meta.url), "utf8");
  assert.match(migration, /old\.accepted_at is null and new\.ativo/);
  assert.match(migration, /new\.user_id is distinct from old\.user_id/);
});

test("photo path is bound to both clinic and client", () => {
  const clinic = "clinic-a";
  const client = "client-a";
  assert.equal(isOwnedClientPhotoPath("clinic-a/client-a/123-photo.jpg", clinic, client), true);
  assert.equal(isOwnedClientPhotoPath("clinic-b/client-a/123-photo.jpg", clinic, client), false);
  assert.equal(isOwnedClientPhotoPath("clinic-a/client-b/123-photo.jpg", clinic, client), false);
  assert.equal(isOwnedClientPhotoPath("clinic-a/client-a/../other", clinic, client), false);
  assert.equal(isOwnedClientPhotoPath("clinic-a/client-a\\other.jpg", clinic, client), false);
});

test("photo delete looks up scoped row and stops when Storage fails", async () => {
  const actions = await readFile(new URL("../src/app/dashboard/actions.js", import.meta.url), "utf8");
  const section = actions.slice(actions.indexOf("export async function deleteClienteFotoAction"), actions.indexOf("function financeRedirectUrl"));
  assert.match(section, /select\("id, storage_path"\)/);
  assert.match(section, /await removeClientPhotoObject/);
  assert.ok(section.indexOf("await removeClientPhotoObject") < section.indexOf(".delete()"));
});
