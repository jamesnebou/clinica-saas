import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertSafeDrTarget, sha256, stableJson } from "./safety.mjs";

const IDS = Object.freeze({
  clinicA: "9a000001-0000-4000-8000-000000000001",
  clinicB: "9a000002-0000-4000-8000-000000000002",
  clinicSwitch: "9a000010-0000-4000-8000-000000000010",
  clientA: "9a000003-0000-4000-8000-000000000003",
  clientB: "9a000004-0000-4000-8000-000000000004",
  professional: "9a000005-0000-4000-8000-000000000005",
  procedure: "9a000006-0000-4000-8000-000000000006",
  appointment: "9a000007-0000-4000-8000-000000000007",
  consent: "9a000008-0000-4000-8000-000000000008",
  photo: "9a000009-0000-4000-8000-000000000009",
  receivable: "9a00000a-0000-4000-8000-00000000000a",
  installment: "9a00000b-0000-4000-8000-00000000000b",
  opportunity: "9a00000c-0000-4000-8000-00000000000c",
  automation: "9a00000d-0000-4000-8000-00000000000d",
  pipeline: "9a00000e-0000-4000-8000-00000000000e",
  stage: "9a00000f-0000-4000-8000-00000000000f",
});

const EMAILS = Object.freeze({
  owner: "dr-owner@nexawi.invalid",
  staff: "dr-staff@nexawi.invalid",
  outsider: "dr-outsider@nexawi.invalid",
  noMembership: "dr-no-membership@nexawi.invalid",
});

const STORAGE_OBJECTS = Object.freeze([
  { bucket: "cliente-fotos", path: `${IDS.clinicA}/${IDS.clientA}/dr-private.png` },
  { bucket: "clinica-logos", path: `${IDS.clinicA}/dr-logo.png` },
  { bucket: "clinica-site-images", path: `${IDS.clinicA}/site/dr-site.png` },
]);

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const TABLES = Object.freeze([
  "clinicas", "usuarios_clinica", "clientes", "cliente_prontuarios",
  "cliente_consentimentos", "cliente_fotos", "profissionais", "procedimentos",
  "agendamentos", "finance_recebiveis", "finance_liquidacoes",
  "finance_recebivel_parcelas", "finance_contas", "crm_pipelines",
  "crm_pipeline_stages", "crm_oportunidades", "automations",
]);

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} é obrigatório.`);
  return value;
}

function client(url, key) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function must(resultPromise, label = "Operação Supabase") {
  const result = await resultPromise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function createSyntheticUser(admin, email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { dr_fixture: true },
    app_metadata: { provider: "email", providers: ["email"], dr_fixture: true },
  });
  if (error) throw error;
  return data.user;
}

async function seed(admin, password, url, anonKey) {
  const users = {};
  for (const [role, email] of Object.entries(EMAILS)) users[role] = await createSyntheticUser(admin, email, password);
  const ownerClient = client(url, anonKey);
  const { error: ownerSignInError } = await ownerClient.auth.signInWithPassword({ email: EMAILS.owner, password });
  if (ownerSignInError) throw new Error(`Login do owner sintético: ${ownerSignInError.message}`);

  await must(admin.from("clinicas").insert([
    { id: IDS.clinicA, nome: "Clínica DR Sintética A", slug: "dr-synthetic-a", status: "ativa" },
    { id: IDS.clinicB, nome: "Clínica DR Sintética B", slug: "dr-synthetic-b", status: "ativa" },
    { id: IDS.clinicSwitch, nome: "Clínica DR Troca", slug: "dr-synthetic-switch", status: "ativa" },
  ]));
  await must(admin.from("usuarios_clinica").insert([
    { clinica_id: IDS.clinicA, user_id: users.owner.id, nome: "Owner DR", email: EMAILS.owner, papel: "owner", ativo: true },
    { clinica_id: IDS.clinicSwitch, user_id: users.owner.id, nome: "Owner DR", email: EMAILS.owner, papel: "owner", ativo: true },
    { clinica_id: IDS.clinicA, user_id: users.staff.id, nome: "Recepção DR", email: EMAILS.staff, papel: "recepcao", ativo: true },
    { clinica_id: IDS.clinicB, user_id: users.outsider.id, nome: "Owner B DR", email: EMAILS.outsider, papel: "owner", ativo: true },
  ]));
  await must(admin.from("clientes").insert([
    { id: IDS.clientA, clinica_id: IDS.clinicA, nome: "Paciente Sintético A", email: "paciente-a@nexawi.invalid", telefone: "(77) 99999-0001", status: "ativo", consentimento_lgpd: true, data_consentimento_lgpd: "2026-09-11T10:00:00Z", observacoes_clinicas: "Fixture DR sem dado real", anamnese: { fixture: true } },
    { id: IDS.clientB, clinica_id: IDS.clinicB, nome: "Paciente Sintético B", email: "paciente-b@nexawi.invalid", telefone: "(77) 99999-0002", status: "ativo", consentimento_lgpd: false, anamnese: {} },
  ]));
  await must(admin.from("cliente_consentimentos").insert({ id: IDS.consent, clinica_id: IDS.clinicA, cliente_id: IDS.clientA, tipo: "imagem", titulo: "Consentimento DR", versao: "dr-v1", texto: "Consentimento exclusivamente sintético.", aceito: true, aceito_em: "2026-09-11T10:00:00Z", aceito_por_nome: "Paciente Sintético A", created_by: users.owner.id }));
  await must(admin.from("profissionais").insert({ id: IDS.professional, clinica_id: IDS.clinicA, nome: "Profissional DR", email: "profissional@nexawi.invalid", ativo: true }));
  await must(admin.from("procedimentos").insert({ id: IDS.procedure, clinica_id: IDS.clinicA, nome: "Procedimento DR", categoria: "Teste", duracao_minutos: 60, preco: 100, ativo: true }));
  await must(admin.from("agendamentos").insert({ id: IDS.appointment, clinica_id: IDS.clinicA, cliente_id: IDS.clientA, profissional_id: IDS.professional, procedimento_id: IDS.procedure, procedimento_ids: [IDS.procedure], inicio: "2031-01-10T12:00:00Z", fim: "2031-01-10T13:00:00Z", status: "confirmado", valor: 100, valor_pago: 40, pagamento_status: "parcial", forma_pagamento: "pix", created_by: users.owner.id }));
  await must(admin.from("cliente_fotos").insert({ id: IDS.photo, clinica_id: IDS.clinicA, cliente_id: IDS.clientA, tipo: "evolucao", titulo: "Foto DR", storage_path: STORAGE_OBJECTS[0].path, mime_type: "image/png", tamanho_bytes: PNG.length, consentimento_id: IDS.consent, created_by: users.owner.id }));

  await must(admin.from("finance_recebiveis").insert({ id: IDS.receivable, clinica_id: IDS.clinicA, cliente_id: IDS.clientA, profissional_id: IDS.professional, procedimento_id: IDS.procedure, agendamento_id: IDS.appointment, descricao: "Recebível DR", origem_tipo: "agendamento", origem_id: IDS.appointment, valor_original: 100, valor_recebido: 0, competencia: "2031-01-01", vencimento: "2031-01-10", status: "aberto", forma_pagamento: "pix", provider: "fixture", provider_reference: "dr-payment", created_by: users.owner.id }));
  await must(admin.from("finance_recebivel_parcelas").insert({ id: IDS.installment, clinica_id: IDS.clinicA, recebivel_id: IDS.receivable, numero: 1, vencimento: "2031-01-10", valor: 100 }));
  const account = await must(admin.from("finance_contas").select("id").eq("clinica_id", IDS.clinicA).eq("padrao", true).limit(1).single());
  await must(admin.rpc("finance_liquidar_recebivel", { p_clinica_id: IDS.clinicA, p_recebivel_id: IDS.receivable, p_valor: 40, p_conta_id: account.id, p_forma_pagamento: "pix", p_data_liquidacao: "2026-09-11T10:00:00Z", p_taxa: 0, p_provider: "fixture", p_provider_reference: "dr-payment", p_idempotency_key: "dr-liquidation", p_metadata: { dr_fixture: true } }));

  await must(ownerClient.from("crm_pipelines").insert({ id: IDS.pipeline, clinica_id: IDS.clinicA, nome: "Pipeline DR", ativo: true, padrao: true, ordem: 0, created_by: users.owner.id }), "Owner criando pipeline CRM");
  await must(ownerClient.from("crm_pipeline_stages").insert({ id: IDS.stage, clinica_id: IDS.clinicA, pipeline_id: IDS.pipeline, nome: "Novo lead DR", slug: "novo-lead-dr", ordem: 10, cor: "#64748b", probabilidade: 10, tipo: "open", semantic_key: "new", ativo: true }), "Owner criando etapa CRM");
  await must(ownerClient.from("crm_oportunidades").insert({ id: IDS.opportunity, clinica_id: IDS.clinicA, cliente_id: IDS.clientA, nome: "Oportunidade DR", titulo: "Oportunidade DR", origem: "outro", status: "lead", pipeline_id: IDS.pipeline, stage_id: IDS.stage, valor_estimado: 100, created_by: users.owner.id, metadata: { dr_fixture: true } }), "Owner criando oportunidade CRM");
  await must(ownerClient.from("automations").insert({ id: IDS.automation, clinica_id: IDS.clinicA, name: "Automação DR", description: "Fixture sintética", status: "draft", trigger_type: "booking.created", draft_definition: { schema_version: 1, trigger: { type: "booking.created" }, steps: [] }, owner_id: users.owner.id, metadata: { dr_fixture: true } }), "Owner criando automação");

  for (const object of STORAGE_OBJECTS) {
    await must(admin.storage.from(object.bucket).upload(object.path, PNG, { contentType: "image/png", upsert: false }));
  }
}

async function authFixture(admin) {
  const found = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    found.push(...data.users.filter((user) => Object.values(EMAILS).includes(user.email)));
    if (data.users.length < 100) break;
  }
  return found.sort((a, b) => a.email.localeCompare(b.email)).map((user) => ({
    id: user.id,
    email: user.email,
    appMetadata: user.app_metadata,
    userMetadata: user.user_metadata,
    identities: (user.identities || []).map((identity) => ({ provider: identity.provider, userId: identity.user_id })).sort((a, b) => a.provider.localeCompare(b.provider)),
  }));
}

async function capture(admin) {
  const tables = {};
  for (const table of TABLES) {
    let query = admin.from(table).select("*");
    query = table === "clinicas" ? query.in("id", [IDS.clinicA, IDS.clinicB, IDS.clinicSwitch]) : query.in("clinica_id", [IDS.clinicA, IDS.clinicB, IDS.clinicSwitch]);
    const rows = await must(query);
    rows.sort((a, b) => String(a.id || a.user_id).localeCompare(String(b.id || b.user_id)));
    tables[table] = { count: rows.length, sha256: sha256(stableJson(rows)) };
  }
  const auth = await authFixture(admin);
  return {
    format: 1,
    migrationsExpected: 55,
    tables,
    auth: { count: auth.length, sha256: sha256(stableJson(auth)) },
    storage: STORAGE_OBJECTS.map((item) => ({ ...item, bytes: PNG.length, sha256: sha256(PNG) })),
  };
}

async function validateAccess({ url, anonKey, admin, password }) {
  const sessions = {};
  for (const role of Object.keys(EMAILS)) {
    const authClient = client(url, anonKey);
    const { data, error } = await authClient.auth.signInWithPassword({ email: EMAILS[role], password });
    if (error) throw error;
    const { data: current, error: currentError } = await authClient.auth.getUser();
    if (currentError || current.user?.id !== data.user.id) throw currentError || new Error("Sessão Auth inválida.");
    sessions[role] = authClient;
  }

  const ownerA = await must(sessions.owner.from("clientes").select("id").eq("clinica_id", IDS.clinicA), "Owner lendo tenant A");
  const ownerB = await must(sessions.owner.from("clientes").select("id").eq("clinica_id", IDS.clinicB), "Owner lendo tenant B");
  const ownerSwitch = await must(sessions.owner.from("clinicas").select("id").eq("id", IDS.clinicSwitch), "Owner lendo clínica secundária");
  const outsiderA = await must(sessions.outsider.from("clientes").select("id").eq("clinica_id", IDS.clinicA), "Outro tenant lendo tenant A");
  const noMembership = await must(sessions.noMembership.from("clinicas").select("id"), "Usuário sem membership lendo clínicas");
  const ownerRecord = await must(sessions.owner.from("cliente_prontuarios").select("cliente_id").eq("clinica_id", IDS.clinicA), "Owner lendo prontuário");
  const staffRecord = await must(sessions.staff.from("cliente_prontuarios").select("cliente_id").eq("clinica_id", IDS.clinicA), "Recepção lendo prontuário");
  if (ownerA.length !== 1 || ownerB.length !== 0 || ownerSwitch.length !== 1 || outsiderA.length !== 0 || noMembership.length !== 0 || ownerRecord.length !== 1 || staffRecord.length !== 0) {
    throw new Error("Validação RLS/cross-tenant falhou.");
  }

  const anon = client(url, anonKey);
  const { error: privateError } = await anon.storage.from("cliente-fotos").download(STORAGE_OBJECTS[0].path);
  if (!privateError) throw new Error("Bucket privado permitiu download anônimo.");
  const { data: signed, error: signedError } = await admin.storage.from("cliente-fotos").createSignedUrl(STORAGE_OBJECTS[0].path, 60);
  if (signedError || !(await fetch(signed.signedUrl)).ok) throw signedError || new Error("Signed URL privada falhou.");
  for (const item of STORAGE_OBJECTS) {
    const { data, error } = await admin.storage.from(item.bucket).download(item.path);
    if (error) throw error;
    const bytes = Buffer.from(await data.arrayBuffer());
    if (sha256(bytes) !== sha256(PNG)) throw new Error("Hash de Storage divergente.");
  }
  for (const item of STORAGE_OBJECTS.slice(1)) {
    const publicUrl = admin.storage.from(item.bucket).getPublicUrl(item.path).data.publicUrl;
    if (!(await fetch(publicUrl)).ok) throw new Error("URL pública de Storage falhou.");
  }
  const recoveryClient = client(url, anonKey);
  const { error: recoveryError } = await recoveryClient.auth.resetPasswordForEmail(EMAILS.owner, { redirectTo: "http://127.0.0.1:3000/login-cliente/nova-senha" });
  if (recoveryError) throw recoveryError;
  return { login: true, session: true, membership: true, crossTenant: true, clinicalRls: true, recoveryRequest: true, signedUrl: true, storageIsolation: true };
}

const mode = process.argv[2];
if (!["seed", "verify"].includes(mode)) throw new Error("Use seed ou verify.");
const url = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const password = required("DR_TEST_PASSWORD");
const projectRef = required("DR_PROJECT_REF");
const archiveDir = path.resolve(required("DR_ARCHIVE_DIR"));
assertSafeDrTarget({ projectRef, operation: mode, supabaseUrl: url });
const admin = client(url, serviceRoleKey);
const baselinePath = path.join(archiveDir, "baseline.json");

if (mode === "seed") {
  await seed(admin, password, url, anonKey);
  const baseline = await capture(admin);
  const access = await validateAccess({ url, anonKey, admin, password });
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ mode, fixture: true, tables: Object.keys(baseline.tables).length, authUsers: baseline.auth.count, storageObjects: baseline.storage.length, access }));
} else {
  const expected = JSON.parse(await readFile(baselinePath, "utf8"));
  const actual = await capture(admin);
  if (stableJson(actual) !== stableJson(expected)) {
    const changedTables = Object.keys(expected.tables).filter((table) => stableJson(actual.tables[table]) !== stableJson(expected.tables[table]));
    const sections = [
      ...changedTables.map((table) => `table:${table}`),
      ...(stableJson(actual.auth) !== stableJson(expected.auth) ? [`auth(expected=${expected.auth.count}/${expected.auth.sha256.slice(0, 12)},actual=${actual.auth.count}/${actual.auth.sha256.slice(0, 12)})`] : []),
      ...(stableJson(actual.storage) !== stableJson(expected.storage) ? ["storage"] : []),
    ];
    throw new Error(`Integridade do restore diverge do baseline sintético: ${sections.join(", ")}.`);
  }
  const access = await validateAccess({ url, anonKey, admin, password });
  console.log(JSON.stringify({ mode, dataIntegrity: true, tables: Object.keys(actual.tables).length, authUsers: actual.auth.count, storageObjects: actual.storage.length, access }));
}
