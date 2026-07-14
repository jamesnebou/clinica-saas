import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { availableProductStock } from "@/lib/store/config";
import { PublicStorefront } from "../store-cart";

export const dynamic = "force-dynamic";

function safeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

export default async function CompleteStorePage({ params, searchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const { data: clinic, error } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, status, metadata")
    .eq("slug", slug)
    .in("status", ["trial", "ativa"])
    .maybeSingle();

  if (error) throw error;
  if (!clinic) notFound();

  const metadata = clinic.metadata || {};
  const site = metadata.site_publico || {};
  if (site.publicado === false || site.lojinha_ativa === false) notFound();

  const { data } = await supabaseAdmin
    .from("produtos_clinica")
    .select("id, nome, categoria, descricao, preco, estoque_atual, estoque_reservado, unidade, imagem_url")
    .eq("clinica_id", clinic.id)
    .eq("ativo", true)
    .eq("publicado_site", true)
    .gt("estoque_atual", 0)
    .order("categoria", { ascending: true })
    .order("nome", { ascending: true });

  const products = (Array.isArray(data) ? data : []).map((product) => ({
    ...product,
    estoque_disponivel: availableProductStock(product),
  }));
  const brandName = metadata.brand_name || clinic.nome;

  return (
    <main
      className="min-h-screen text-[#181510]"
      style={{
        "--clinic-primary": safeColor(metadata.primary_color, "#2e3a2d"),
        "--clinic-accent": safeColor(metadata.accent_color, "#d99bae"),
        background: "radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--clinic-accent) 18%, transparent), transparent 30rem), linear-gradient(145deg, #fffaf5, #eee8df)",
      }}
    >
      <header className="sticky top-0 z-40 border-b border-white/40 bg-[#17130f]/92 px-5 py-4 text-white shadow-sm backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center gap-5 pr-16 sm:pr-40">
          <Link href={"/c/" + slug} className="shrink-0 text-sm font-bold text-white/72 transition hover:text-white">← Voltar ao site</Link>
          <span className="truncate text-sm font-black sm:text-base">{brandName}</span>
        </div>
      </header>
      <PublicStorefront slug={slug} products={products} recoveryToken={query?.carrinho || ""} mode="full" />
    </main>
  );
}
