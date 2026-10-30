import assert from "node:assert/strict";
import test from "node:test";
import { auditClientPhotoOrphans } from "../scripts/ops/client-photo-orphans.mjs";

test("photo orphan audit compares physical objects and rows without mutation", async () => {
  const client = {
    storage: {
      listBuckets: async () => ({ data: [
        { id: "cliente-fotos", public: false },
        { id: "clinica-logos", public: true },
        { id: "clinica-site-images", public: true },
      ], error: null }),
      from: (bucket) => ({ list: async (prefix) => {
        if (bucket !== "cliente-fotos") return { data: [], error: null };
        if (!prefix) return { data: [{ name: "clinic", id: null }], error: null };
        if (prefix === "clinic") return { data: [{ name: "client", id: null }], error: null };
        if (prefix === "clinic/client") return { data: [
          { name: "referenced.jpg", id: "one" }, { name: "orphan.jpg", id: "two" },
        ], error: null };
        return { data: [], error: null };
      } }),
    },
    from(table) {
      assert.equal(table, "cliente_fotos");
      return { select() { return this; }, not() { return this; }, order() { return this; },
        range: async () => ({ data: [
          { storage_path: "clinic/client/referenced.jpg" },
          { storage_path: "clinic/client/missing.jpg" },
        ], error: null }),
      };
    },
  };
  const env = {
    AUDIT_PROJECT_REF: "ojmszqqxnvmvudhzzzgo",
    AUDIT_SUPABASE_URL: "https://ojmszqqxnvmvudhzzzgo.supabase.co",
    AUDIT_CONFIRM: "READ_ONLY:ojmszqqxnvmvudhzzzgo",
    AUDIT_SERVICE_ROLE_KEY: "synthetic-key",
  };
  const result = await auditClientPhotoOrphans(env, { clientFactory: () => client });
  assert.deepEqual(result, { projectRef: env.AUDIT_PROJECT_REF, stored: 2, referenced: 2, unreferenced: 1, missing: 1 });
  await assert.rejects(auditClientPhotoOrphans({ ...env, AUDIT_SUPABASE_URL: "https://sitoiwxalwfybcqivutd.supabase.co" }, { clientFactory: () => client }), /target_invalid/);
});
