import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { productShowcaseCategories, productShowcaseTabs, productTabsForCategory, nextProductTab } from "../src/lib/marketing/product-showcase.mjs";
const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("galeria inclui as 17 telas solicitadas, com arquivos independentes", async () => {
  assert.deepEqual(productShowcaseTabs.map(({ id }) => id), ["visao-geral","inteligencia-bi","agenda","notificacoes","whatsapp","clientes","crm","automacoes","profissionais","procedimentos","lojinha","pedidos","usuarios","configuracoes","financeiro","assinatura","tutoriais"]);
  assert.equal(new Set(productShowcaseTabs.map(({ image }) => image)).size, 17);
  const hashes = [];
  for (const tab of productShowcaseTabs) {
    assert.equal(tab.image, `/marketing/odontologia/sistema/${tab.id}.png`);
    const image = await readFile(new URL("../public" + tab.image, import.meta.url));
    assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    hashes.push(createHash("sha256").update(image).digest("hex"));
  }
  assert.equal(new Set(hashes).size, productShowcaseTabs.length);
});
test("galeria agrupa todas as telas nas categorias comerciais", () => {
  assert.deepEqual(productShowcaseCategories.map(({ id }) => id), ["operacao", "relacionamento", "gestao", "administracao"]);
  assert.deepEqual(productTabsForCategory("operacao").map(({ id }) => id), ["visao-geral", "inteligencia-bi", "agenda", "notificacoes"]);
  assert.deepEqual(productTabsForCategory("relacionamento").map(({ id }) => id), ["whatsapp", "clientes", "crm", "automacoes"]);
  assert.deepEqual(productTabsForCategory("gestao").map(({ id }) => id), ["profissionais", "procedimentos", "usuarios", "financeiro"]);
  assert.deepEqual(productTabsForCategory("administracao").map(({ id }) => id), ["lojinha", "pedidos", "configuracoes", "assinatura", "tutoriais"]);
});
test("teclado da galeria permite setas, Home e End sem ultrapassar abas", () => {
  assert.equal(nextProductTab("ArrowRight", 16, 17), 0);
  assert.equal(nextProductTab("ArrowLeft", 0, 17), 16);
  assert.equal(nextProductTab("Home", 8, 17), 0);
  assert.equal(nextProductTab("End", 8, 17), 16);
  assert.equal(nextProductTab("Tab", 8, 17), null);
});
test("galeria renderiza apenas imagem ativa com painel acessivel e fallback", async () => {
  const gallery = await source("src/components/marketing/premium/premium-product-gallery.js");
  assert.match(gallery, /role="tablist"/);
  assert.match(gallery, /productShowcaseCategories/);
  assert.match(gallery, /aria-pressed=\{category === item.id\}/);
  assert.match(gallery, /trackMarketingEvent\("product_gallery_tab"/);
  assert.match(gallery, /galleryControls/);
  assert.match(gallery, /role="tabpanel"/);
  assert.match(gallery, /aria-selected=\{active === index\}/);
  assert.match(gallery, /active === index &&/);
  assert.match(gallery, /failed \? fallbackImage : tab.image/);
  assert.match(gallery, /key=\{tab.id\}/);
  assert.match(gallery, /href=\{src\}/);
  assert.doesNotMatch(gallery, /fetch\(|priority/);
  const page = await source("src/components/marketing/premium/premium-segment-landing-page.js");
  assert.match(page, /PremiumProductGallery fallbackImage="\/clinic-dashboard-preview.png"/);
  assert.match(page, /location: "product_showcase", segment: config.slug/);
});
test("galeria reserva dimensoes e mantem rolagem mobile isolada", async () => {
  const css = await source("src/components/marketing/premium/premium.module.css");
  assert.match(css, /aspect-ratio:1907 \/ 1079/);
  assert.match(css, /object-fit:contain/);
  assert.match(css, /overscroll-behavior-x:contain/);
  assert.match(css, /\.comparisonTableWrap \{ display:none; \}/);
  assert.match(css, /\.mobilePlanComparison \{ display:grid;/);
});
