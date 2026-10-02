import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { removeOwnedClinicDomain } from "../src/lib/vercel/clinic-domain-removal.mjs";

const clinicA = "clinic-a";
const clinicB = "clinic-b";
const domainA = { id: "domain-a", clinica_id: clinicA, dominio: "a.com.br" };
const domainB = { id: "domain-b", clinica_id: clinicB, dominio: "b.com.br" };

function fixture({ domains = [domainA, domainB], remoteResult = { ok: true }, remoteError = null } = {}) {
  const rows = new Map(domains.map((row) => [row.id, row]));
  const events = [];
  const database = {
    from(table) {
      assert.equal(table, "clinica_dominios");
      const filters = {};
      let deleting = false;
      return {
        select() { return this; },
        delete() { deleting = true; return this; },
        eq(key, value) { filters[key] = value; return this; },
        async maybeSingle() {
          const row = [...rows.values()].find((item) => Object.entries(filters).every(([key, value]) => item[key] === value));
          events.push(deleting ? "delete" : "lookup");
          if (deleting && row) rows.delete(row.id);
          return { data: row || null, error: null };
        },
      };
    },
  };
  async function removeRemote(domain) {
    events.push(`vercel:${domain}`);
    if (remoteError) throw remoteError;
    return remoteResult;
  }
  return { rows, events, database, removeRemote };
}

test("clínica remove seu próprio domínio após validar propriedade", async () => {
  const context = fixture();
  const result = await removeOwnedClinicDomain({ clinicId: clinicA, domain: domainA.dominio, database: context.database, removeRemote: context.removeRemote });
  assert.deepEqual(result, { status: "removed" });
  assert.deepEqual(context.events, ["lookup", `vercel:${domainA.dominio}`, "delete"]);
  assert.equal(context.rows.has(domainA.id), false);
  assert.equal(context.rows.has(domainB.id), true);
});

test("clínica A não remove nem consulta na Vercel o domínio da clínica B", async () => {
  const context = fixture();
  const result = await removeOwnedClinicDomain({ clinicId: clinicA, domain: domainB.dominio, database: context.database, removeRemote: context.removeRemote });
  assert.deepEqual(result, { status: "not_found" });
  assert.deepEqual(context.events, ["lookup"]);
  assert.equal(context.rows.has(domainB.id), true);
});

test("sem clínica autenticada não consulta banco nem Vercel", async () => {
  const context = fixture();
  const result = await removeOwnedClinicDomain({ clinicId: null, domain: domainA.dominio, database: context.database, removeRemote: context.removeRemote });
  assert.deepEqual(result, { status: "unauthorized" });
  assert.deepEqual(context.events, []);
  assert.equal(context.rows.has(domainA.id), true);
});

test("domínio inexistente falha sem chamada destrutiva", async () => {
  const context = fixture();
  const result = await removeOwnedClinicDomain({ clinicId: clinicA, domain: "missing.com.br", database: context.database, removeRemote: context.removeRemote });
  assert.deepEqual(result, { status: "not_found" });
  assert.deepEqual(context.events, ["lookup"]);
});

test("falha retornada pela Vercel preserva o vínculo local", async () => {
  const context = fixture({ remoteResult: { ok: false, message: "remote failure" } });
  const result = await removeOwnedClinicDomain({ clinicId: clinicA, domain: domainA.dominio, database: context.database, removeRemote: context.removeRemote });
  assert.deepEqual(result, { status: "remote_failed" });
  assert.deepEqual(context.events, ["lookup", `vercel:${domainA.dominio}`]);
  assert.equal(context.rows.has(domainA.id), true);
});

test("exceção da Vercel também preserva o vínculo local", async () => {
  const context = fixture({ remoteError: new Error("network failure") });
  const result = await removeOwnedClinicDomain({ clinicId: clinicA, domain: domainA.dominio, database: context.database, removeRemote: context.removeRemote });
  assert.deepEqual(result, { status: "remote_failed" });
  assert.equal(context.rows.has(domainA.id), true);
  assert.equal(context.events.includes("delete"), false);
});

test("clinic_id e domain_id forjados no formulário não substituem o tenant da sessão", async () => {
  const context = fixture();
  const manipulatedForm = new FormData();
  manipulatedForm.set("clinica_id", clinicB);
  manipulatedForm.set("domain_id", domainB.id);
  manipulatedForm.set("dominio", domainB.dominio);
  const result = await removeOwnedClinicDomain({ clinicId: clinicA, domain: manipulatedForm.get("dominio"), database: context.database, removeRemote: context.removeRemote });
  assert.deepEqual(result, { status: "not_found" });
  assert.deepEqual(context.events, ["lookup"]);
  assert.equal(context.rows.has(domainB.id), true);
});

test("a action exige sessão e papel de gestor antes de iniciar a remoção", async () => {
  const source = await readFile(new URL("../src/app/dashboard/actions.js", import.meta.url), "utf8");
  const action = source.slice(source.indexOf("export async function removeClinicDomainAction"), source.indexOf("export async function updateClinicSettingsAction"));
  assert.match(action, /getScopedSupabase\(\)/);
  assert.match(action, /requireClinicManager\(memberships, clinicaId/);
  assert.match(action, /clinicId: clinicaId/);
  assert.doesNotMatch(action, /formData\.get\("clinica_id"\)|formData\.get\("domain_id"\)/);
  assert.ok(action.indexOf("requireClinicManager") < action.indexOf("removeOwnedClinicDomain"));
  assert.match(source, /\["owner", "admin"\]\.includes\(membership\?\.papel\)/);
});
