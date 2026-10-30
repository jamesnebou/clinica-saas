import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { mainModule, requireValue } from "./core.mjs";
import { storageCatalog } from "./backup-export.mjs";

export async function auditClientPhotoOrphans(env, { clientFactory = createClient } = {}) {
  const ref = requireValue(env, "AUDIT_PROJECT_REF");
  const url = new URL(requireValue(env, "AUDIT_SUPABASE_URL"));
  if (!/^[a-z]{20}$/.test(ref) || url.href !== `https://${ref}.supabase.co/` ||
      env.AUDIT_CONFIRM !== `READ_ONLY:${ref}`) throw new Error("ops_photo_audit_target_invalid");
  const client = clientFactory(url.origin, requireValue(env, "AUDIT_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const catalog = await storageCatalog(client);
  const stored = new Set(catalog.objects.filter((item) => item.bucket === "cliente-fotos").map((item) => item.name));
  const referenced = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("cliente_fotos")
      .select("storage_path").not("storage_path", "is", null).order("id").range(offset, offset + 999);
    if (error || !Array.isArray(data)) throw new Error("ops_photo_audit_query_failed");
    for (const row of data) referenced.add(row.storage_path);
    if (data.length < 1000) break;
  }
  const unreferenced = [...stored].filter((name) => !referenced.has(name));
  const missing = [...referenced].filter((name) => !stored.has(name));
  if (env.AUDIT_REPORT_PATH) {
    const filename = path.resolve(env.AUDIT_REPORT_PATH);
    await writeFile(filename, JSON.stringify({ projectRef: ref, createdAt: new Date().toISOString(),
      unreferenced, missing }, null, 2), { flag: "wx", mode: 0o600 });
  }
  return { projectRef: ref, stored: stored.size, referenced: referenced.size,
    unreferenced: unreferenced.length, missing: missing.length };
}

if (mainModule(import.meta.url)) {
  auditClientPhotoOrphans(process.env).then((result) => console.log(JSON.stringify(result))).catch(() => {
    console.error(JSON.stringify({ status: "failed", code: "ops_photo_audit_failed" }));
    process.exitCode = 1;
  });
}
