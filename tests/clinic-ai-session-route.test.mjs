import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";

const clinicId = "00000000-0000-4000-8000-000000000001";
const otherClinicId = "00000000-0000-4000-8000-000000000002";
const state = { userId: "user-a", clinicId, role: "owner", mode: "unlimited_lifetime", agendaAllowed: true, capability: true, calls: [] };
globalThis.__aiSession = state;
const fake = new Map([
  ["@/lib/auth/session", `export const getUserClinics = async () => {
    globalThis.__aiSession.calls.push('session');
    const s = globalThis.__aiSession;
    return { user: s.userId ? { id: s.userId } : null, activeClinic: { id: s.clinicId },
      memberships: [{ clinica_id: s.clinicId, user_id: s.userId, ativo: true, papel: s.role }] };
  };
  export const resolveClinicPlanEntitlements = async () => ({ id: globalThis.__aiSession.clinicId,
    plan_entitlements_mode: globalThis.__aiSession.mode });`],
  ["@/lib/supabase/server", "export const createClient = async () => ({})"],
  ["@/lib/auth/permissions", `export const getCurrentMembership = (memberships, id) => memberships.find((item) => item.clinica_id === id);
    export const canAccessSection = () => globalThis.__aiSession.agendaAllowed;
    export const sectionHasCapability = () => globalThis.__aiSession.capability;`],
  ["@/lib/saas/plans", "export const getClinicPlan = async () => ({})"],
  ["@/lib/segments/service", "export const getClinicCapabilities = async () => ({ effective: ['agenda'] })"],
  ["@/lib/security/public-antiabuse", `export const noStoreJson = (body, init = {}) => Response.json(body, {
    ...init, headers: { 'Cache-Control': 'no-store' } });`],
]);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (fake.has(specifier)) return { url: `data:text/javascript,${encodeURIComponent(fake.get(specifier))}`, shortCircuit: true };
  if (specifier === "@/lib/ai/access.mjs") return { url: new URL("../src/lib/ai/access.mjs", import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });

const { GET } = await import("../src/app/api/ai/session/route.js");
test.after(() => { delete globalThis.__aiSession; });

async function check() {
  const response = await GET();
  return { status: response.status, body: await response.json(), cache: response.headers.get("Cache-Control") };
}

test("session revalidation returns only an opaque scoped key and never caches it", async () => {
  const first = await check();
  assert.equal(first.status, 200);
  assert.equal(first.cache, "no-store");
  assert.deepEqual(Object.keys(first.body), ["scopeKey"]);
  assert.equal(first.body.scopeKey, createHash("sha256").update("clinic-ai\0").update("user-a").update("\0").update(clinicId).digest("hex"));
  assert.doesNotMatch(JSON.stringify(first.body), /user-a|00000000/);
  state.clinicId = otherClinicId;
  const other = await check();
  assert.equal(other.status, 200);
  assert.notEqual(other.body.scopeKey, first.body.scopeKey);
  state.clinicId = clinicId;
});

test("session revalidation fails closed on auth, role, entitlement and agenda changes", async () => {
  for (const [key, value, status] of [
    ["userId", null, 401], ["role", "recepcao", 403], ["mode", "trial", 403],
    ["agendaAllowed", false, 403], ["capability", false, 403],
  ]) {
    const original = state[key];
    state[key] = value;
    const result = await check();
    assert.equal(result.status, status, key);
    assert.equal(result.cache, "no-store");
    assert.equal(Object.hasOwn(result.body, "scopeKey"), false);
    state[key] = original;
  }
  assert.ok(state.calls.every((value) => value === "session"));
});
