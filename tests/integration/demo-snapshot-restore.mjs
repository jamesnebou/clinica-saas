import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
}

const db = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const clinicA = randomUUID();
const clinicB = randomUUID();
const clientA = randomUUID();
const clientB = randomUUID();
const professionalA = randomUUID();

async function must(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data;
}

try {
  await must(db.from("clinicas").insert([
    { id: clinicA, nome: "Demo restore A", slug: `demo-restore-a-${clinicA}`, status: "ativa" },
    { id: clinicB, nome: "Demo restore B", slug: `demo-restore-b-${clinicB}`, status: "ativa" },
  ]));
  await must(db.from("clientes").insert([
    { id: clientA, clinica_id: clinicA, nome: "Paciente original A", telefone: "(77) 99999-1111", status: "ativo" },
    { id: clientB, clinica_id: clinicB, nome: "Paciente original B", telefone: "(11) 98888-2222", status: "ativo" },
  ]));
  await must(db.from("profissionais").insert({
    id: professionalA,
    clinica_id: clinicA,
    nome: "Profissional original A",
    ativo: true,
  }));

  const captured = await must(db.rpc("capture_clinica_demo_snapshot", { p_clinica_id: clinicA }));
  assert.equal(captured, true);

  await must(db.from("clientes").update({ nome: "Paciente alterado A", telefone: "(77) 98888-0000" }).eq("id", clientA));
  await must(db.from("clientes").insert({
    id: randomUUID(),
    clinica_id: clinicA,
    nome: "Paciente posterior ao snapshot",
    telefone: "(77) 97777-0000",
    status: "ativo",
  }));
  await must(db.from("profissionais").update({ nome: "Profissional alterado A" }).eq("id", professionalA));

  const firstRestore = await must(db.rpc("restore_clinica_demo_snapshot", { p_clinica_id: clinicA }));
  assert.equal(firstRestore, true);

  let restoredClients = await must(db.from("clientes")
    .select("id, nome, telefone, telefone_whatsapp")
    .eq("clinica_id", clinicA));
  assert.deepEqual(restoredClients, [{
    id: clientA,
    nome: "Paciente original A",
    telefone: "(77) 99999-1111",
    telefone_whatsapp: "5577999991111",
  }]);

  let restoredProfessional = await must(db.from("profissionais").select("id, nome").eq("id", professionalA).single());
  assert.deepEqual(restoredProfessional, { id: professionalA, nome: "Profissional original A" });

  const tenantBBeforeRepeat = await must(db.from("clientes")
    .select("id, nome, telefone, telefone_whatsapp")
    .eq("id", clientB)
    .single());

  const repeatedRestore = await must(db.rpc("restore_clinica_demo_snapshot", { p_clinica_id: clinicA }));
  assert.equal(repeatedRestore, true);

  restoredClients = await must(db.from("clientes")
    .select("id, nome, telefone, telefone_whatsapp")
    .eq("clinica_id", clinicA));
  restoredProfessional = await must(db.from("profissionais").select("id, nome").eq("id", professionalA).single());
  const tenantBAfterRepeat = await must(db.from("clientes")
    .select("id, nome, telefone, telefone_whatsapp")
    .eq("id", clientB)
    .single());

  assert.equal(restoredClients.length, 1);
  assert.equal(restoredClients[0].telefone_whatsapp, "5577999991111");
  assert.deepEqual(restoredProfessional, { id: professionalA, nome: "Profissional original A" });
  assert.deepEqual(tenantBAfterRepeat, tenantBBeforeRepeat);

  const snapshot = await must(db.from("clinica_demo_snapshots")
    .select("snapshot")
    .eq("clinica_id", clinicA)
    .single());
  const tamperedSnapshot = structuredClone(snapshot.snapshot);
  tamperedSnapshot.clientes.push({
    id: randomUUID(),
    clinica_id: clinicB,
    nome: "Tentativa cross-tenant",
    status: "ativo",
  });
  await must(db.from("clinica_demo_snapshots")
    .update({ snapshot: tamperedSnapshot })
    .eq("clinica_id", clinicA));

  const rejectedRestore = await db.rpc("restore_clinica_demo_snapshot", { p_clinica_id: clinicA });
  assert.equal(rejectedRestore.error?.code, "42501");
  const tenantAAfterRejectedRestore = await must(db.from("clientes").select("id, nome").eq("clinica_id", clinicA));
  const tenantBAfterRejectedRestore = await must(db.from("clientes")
    .select("id, nome, telefone, telefone_whatsapp")
    .eq("id", clientB)
    .single());
  assert.deepEqual(tenantAAfterRejectedRestore, [{ id: clientA, nome: "Paciente original A" }]);
  assert.deepEqual(tenantBAfterRejectedRestore, tenantBBeforeRepeat);

  console.log("demo_snapshot_restore_ok", {
    restoredClients: restoredClients.length,
    generatedPhoneRecalculated: true,
    repeatedRestore: true,
    crossTenantIsolation: true,
    tamperedSnapshotRejected: true,
  });
} finally {
  await db.from("clinicas").delete().in("id", [clinicA, clinicB]);
}
