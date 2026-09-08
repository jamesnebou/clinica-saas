import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error("Defina LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON_KEY e LOCAL_SUPABASE_SERVICE_ROLE_KEY.");
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, serviceRoleKey, options);
const suffix = randomUUID();
const password = `Rls-${randomUUID()}-Aa1!`;
const clinicA = randomUUID();
const clinicB = randomUUID();
const clientA = randomUUID();
const clientB = randomUUID();
const createdUsers = [];

const identities = {
  ownerA: { email: `owner-a-${suffix}@nexawi.test`, role: "owner", permissions: {} },
  adminA: { email: `admin-a-${suffix}@nexawi.test`, role: "admin", permissions: {} },
  restrictedAdminA: { email: `restricted-admin-a-${suffix}@nexawi.test`, role: "admin", permissions: { secoes: ["clientes"] } },
  professionalA: { email: `professional-a-${suffix}@nexawi.test`, role: "profissional", permissions: { secoes: ["clientes", "prontuario"] } },
  restrictedProfessionalA: { email: `restricted-professional-a-${suffix}@nexawi.test`, role: "profissional", permissions: { secoes: ["clientes"] } },
  receptionA: { email: `reception-a-${suffix}@nexawi.test`, role: "recepcao", permissions: {} },
  financeA: { email: `finance-a-${suffix}@nexawi.test`, role: "financeiro", permissions: {} },
  ownerB: { email: `owner-b-${suffix}@nexawi.test`, role: "owner", permissions: {} },
};

async function createIdentity(identity, clinicId) {
  const { data, error } = await admin.auth.admin.createUser({ email: identity.email, password, email_confirm: true });
  assert.ifError(error);
  createdUsers.push(data.user.id);
  const result = await admin.from("usuarios_clinica").insert({
    clinica_id: clinicId,
    user_id: data.user.id,
    email: identity.email,
    papel: identity.role,
    permissoes: identity.permissions,
    ativo: true,
  });
  assert.ifError(result.error);
}

async function authenticatedClient(email) {
  const client = createClient(url, anonKey, options);
  const { error } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  return client;
}

async function expectClinicalAccess(identity, expectedAllergy, ownClientId, forbiddenClientId) {
  const client = await authenticatedClient(identity.email);
  const medical = await client.from("cliente_prontuarios").select("cliente_id, alergias");
  assert.ifError(medical.error);
  assert.deepEqual(medical.data, [{ cliente_id: ownClientId, alergias: expectedAllergy }]);
  const foreign = await client.from("cliente_prontuarios").select("cliente_id").eq("cliente_id", forbiddenClientId);
  assert.ifError(foreign.error);
  assert.deepEqual(foreign.data, []);
}

async function expectAdministrativeOnly(identity) {
  const client = await authenticatedClient(identity.email);
  const registration = await client.from("clientes").select("id, nome").eq("id", clientA);
  assert.ifError(registration.error);
  assert.equal(registration.data.length, 1);
  const legacyClinical = await client.from("clientes").select("id, anamnese").eq("id", clientA);
  assert.equal(legacyClinical.error?.code, "42501");

  for (const table of ["cliente_prontuarios", "cliente_fotos", "cliente_consentimentos"]) {
    const result = await client.from(table).select("id");
    assert.ifError(result.error);
    assert.deepEqual(result.data, []);
  }

  const insert = await client.from("cliente_prontuarios").insert({
    clinica_id: clinicA,
    cliente_id: clientA,
    alergias: "Tentativa indevida",
  });
  assert.equal(insert.error?.code, "42501");
}

async function expectNoClinicalAccess(identity) {
  const client = await authenticatedClient(identity.email);
  const medical = await client.from("cliente_prontuarios").select("id");
  assert.ifError(medical.error);
  assert.deepEqual(medical.data, []);
}

try {
  let result = await admin.from("clinicas").insert([
    { id: clinicA, nome: "Tenant A REST RLS", slug: `tenant-a-${suffix}`, status: "ativa" },
    { id: clinicB, nome: "Tenant B REST RLS", slug: `tenant-b-${suffix}`, status: "ativa" },
  ]);
  assert.ifError(result.error);

  await createIdentity(identities.ownerA, clinicA);
  await createIdentity(identities.adminA, clinicA);
  await createIdentity(identities.restrictedAdminA, clinicA);
  await createIdentity(identities.professionalA, clinicA);
  await createIdentity(identities.restrictedProfessionalA, clinicA);
  await createIdentity(identities.receptionA, clinicA);
  await createIdentity(identities.financeA, clinicA);
  await createIdentity(identities.ownerB, clinicB);

  result = await admin.from("clientes").insert([
    { id: clientA, clinica_id: clinicA, nome: "Paciente A REST", status: "ativo" },
    { id: clientB, clinica_id: clinicB, nome: "Paciente B REST", status: "ativo" },
  ]);
  assert.ifError(result.error);

  result = await admin.from("cliente_prontuarios").upsert([
    { clinica_id: clinicA, cliente_id: clientA, alergias: "Tenant A" },
    { clinica_id: clinicB, cliente_id: clientB, alergias: "Tenant B" },
  ], { onConflict: "clinica_id,cliente_id" });
  assert.ifError(result.error);

  result = await admin.from("cliente_fotos").insert({
    clinica_id: clinicA,
    cliente_id: clientA,
    tipo: "documento",
    titulo: "Anexo REST",
    url: "https://example.invalid/rest-anexo",
  });
  assert.ifError(result.error);
  result = await admin.from("cliente_consentimentos").insert({
    clinica_id: clinicA,
    cliente_id: clientA,
    tipo: "anamnese",
    titulo: "Consentimento REST",
    texto: "Teste local",
  });
  assert.ifError(result.error);

  await expectClinicalAccess(identities.ownerA, "Tenant A", clientA, clientB);
  await expectClinicalAccess(identities.adminA, "Tenant A", clientA, clientB);
  await expectNoClinicalAccess(identities.restrictedAdminA);
  await expectClinicalAccess(identities.professionalA, "Tenant A", clientA, clientB);
  await expectNoClinicalAccess(identities.restrictedProfessionalA);
  await expectAdministrativeOnly(identities.receptionA);
  await expectAdministrativeOnly(identities.financeA);
  await expectClinicalAccess(identities.ownerB, "Tenant B", clientB, clientA);
  console.log("REST/Supabase client RLS: PASS");
} finally {
  await admin.from("clinicas").delete().in("id", [clinicA, clinicB]);
  for (const userId of createdUsers) await admin.auth.admin.deleteUser(userId);
}
