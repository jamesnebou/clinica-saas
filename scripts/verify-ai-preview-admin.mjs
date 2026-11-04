import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const PREVIEW_BRANCH = "feat/ai-summary-alpha-next164";
const STAGING_URL = "https://ojmszqqxnvmvudhzzzgo.supabase.co";

export async function verifyPreviewAdminCredential({ env, checkAdmin }) {
  if (env.VERCEL_ENV !== "preview") return { skipped: true, ok: true };
  if (env.VERCEL_GIT_COMMIT_REF !== PREVIEW_BRANCH
    || env.NEXT_PUBLIC_SUPABASE_URL !== STAGING_URL
    || (env.SUPABASE_URL && env.SUPABASE_URL !== STAGING_URL)
    || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: false, ok: false };

  try {
    const ok = await checkAdmin(STAGING_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    return { skipped: false, ok: ok === true };
  } catch {
    return { skipped: false, ok: false };
  }
}

export async function runPreviewAdminCredentialCheck({ env = process.env, log = console.log, checkAdmin = async (url, key) => {
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
  return !error && Array.isArray(data?.users);
} } = {}) {
  const result = await verifyPreviewAdminCredential({ env, checkAdmin });
  if (!result.skipped) log(`STAGING_ADMIN_CREDENTIAL_CHECK: ${result.ok ? "PASS" : "FAIL"}`);
  return result.ok;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!await runPreviewAdminCredentialCheck()) process.exitCode = 1;
}
