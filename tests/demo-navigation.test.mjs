import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("navegacao da Demo rele a sessao em cada rota da sidebar", async () => {
  const [layout, sidebar] = await Promise.all([
    readFile(new URL("../src/app/dashboard/layout.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/app-shell/sidebar-nav.js", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /MobileSidebarMenu[\s\S]*forceDocumentNavigation=\{isDemo\}/);
  assert.match(layout, /SidebarNav[\s\S]*forceDocumentNavigation=\{isDemo\}/);
  assert.match(sidebar, /forceDocumentNavigation\s*\?\s*"a"\s*:\s*Link/g);
});

test("contexto da clinica valida a autenticacao com uma unica leitura", async () => {
  const session = await readFile(new URL("../src/lib/auth/session.js", import.meta.url), "utf8");
  const requireClinic = session.slice(
    session.indexOf("export async function requireClinic()"),
    session.indexOf("export async function requireClinicSection"),
  );

  assert.doesNotMatch(requireClinic, /requireUser\(/);
  assert.match(requireClinic, /const context = await getUserClinics\(\)/);
  assert.match(requireClinic, /if \(!context\.user\)[\s\S]*redirect\("\/login-cliente"\)/);
});

test("rotas GET da Demo com efeitos de autenticacao nunca sao antecipadas", async () => {
  const [conversionCta, marketingPortal, segmentLanding] = await Promise.all([
    readFile(new URL("../src/components/demo/demo-conversion-cta.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/marketing/marketing-portal.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/marketing/segment-landing-page.js", import.meta.url), "utf8"),
  ]);

  assert.match(conversionCta, /href="\/auth\/leave-demo\?next=%2Fcadastro"\s+prefetch=\{false\}/);
  assert.match(marketingPortal, /href="\/demo"\s+prefetch=\{false\}/);
  assert.match(segmentLanding, /href=\{config\.hero\.secondaryCta\.href\}\s+prefetch=\{false\}/);
  assert.match(segmentLanding, /href="\/demo"\s+prefetch=\{false\}/);
});
