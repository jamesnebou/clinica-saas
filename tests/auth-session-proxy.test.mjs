import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Proxy renova a sessão Supabase antes das rotas autenticadas", async () => {
  const source = await readFile(new URL("../src/proxy.js", import.meta.url), "utf8");

  assert.match(source, /createServerClient/);
  assert.match(source, /"\/dashboard\/:path\*"/);
  assert.match(source, /request\.cookies\.set\(name, value\)/);
  assert.match(source, /response\.cookies\.set\(name, value, options\)/);
  assert.match(source, /await supabase\.auth\.getClaims\(\)/);

  const refreshCheck = source.indexOf("isSessionAwarePath(request.nextUrl.pathname)");
  const customDomainLookup = source.lastIndexOf("findSlugByDomain(host)");
  assert.ok(refreshCheck >= 0 && refreshCheck < customDomainLookup);
});
