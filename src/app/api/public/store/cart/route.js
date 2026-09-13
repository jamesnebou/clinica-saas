import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePublicCartItems } from "@/lib/store/config";
import { consumePublicRateLimit, noStoreJson, publicRateLimitResponse } from "@/lib/security/public-antiabuse";
import { isValidPublicSlug, readBoundedJson, safePublicOriginMetadata } from "@/lib/security/public-antiabuse-core.mjs";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value, max = 180) {
  return String(value || "").trim().slice(0, max);
}

async function getClinic(slug) {
  const { data, error } = await supabaseAdmin
    .from("clinicas")
    .select("id, slug, status, metadata")
    .eq("slug", slug)
    .in("status", ["trial", "ativa"])
    .maybeSingle();
  if (error) throw error;
  if (!data || data.metadata?.site_publico?.publicado === false || data.metadata?.site_publico?.lojinha_ativa === false) return null;
  return data;
}

async function getProducts(clinicId, ids) {
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin
    .from("produtos_clinica")
    .select("id, nome, categoria, preco, imagem_url, estoque_atual, estoque_reservado")
    .eq("clinica_id", clinicId)
    .eq("ativo", true)
    .eq("publicado_site", true)
    .in("id", ids);
  if (error) throw error;
  return data || [];
}

export async function GET(request) {
  const url = new URL(request.url);
  const slug = clean(url.searchParams.get("slug"), 120);
  const token = clean(url.searchParams.get("token"), 80);
  if (!isValidPublicSlug(slug) || !UUID_PATTERN.test(token)) return noStoreJson({ ok: false, error: "Carrinho inválido." }, { status: 400 });

  const clinic = await getClinic(slug);
  if (!clinic) return noStoreJson({ ok: false, error: "Lojinha indisponível." }, { status: 404 });
  const rateLimit = await consumePublicRateLimit({ scope: "cart_read", headers: request.headers, tenantId: clinic.id });
  if (!rateLimit.allowed) return publicRateLimitResponse(rateLimit);

  const { data: cart, error } = await supabaseAdmin
    .from("carrinhos_abandonados_clinica")
    .select("id, sessao_token, token_recuperacao, status, itens, cupom_codigo")
    .eq("clinica_id", clinic.id)
    .or(`sessao_token.eq.${token},token_recuperacao.eq.${token}`)
    .maybeSingle();
  if (error) throw error;
  if (!cart || ["convertido", "expirado", "descartado"].includes(cart.status)) {
    return noStoreJson({ ok: false, error: "Carrinho não encontrado." }, { status: 404 });
  }

  const ids = (cart.itens || []).map((item) => String(item?.produto_id || item?.id || "")).filter((id) => UUID_PATTERN.test(id));
  const products = await getProducts(clinic.id, ids);
  const items = normalizePublicCartItems(cart.itens, products);

  if (cart.status === "ativo" && token === cart.token_recuperacao) {
    await supabaseAdmin.from("carrinhos_abandonados_clinica").update({ status: "recuperado", ultima_interacao_em: new Date().toISOString() }).eq("id", cart.id);
  }

  return noStoreJson({ ok: true, sessionToken: cart.sessao_token, recoveryToken: cart.token_recuperacao, items, couponCode: cart.cupom_codigo || "" });
}

export async function POST(request) {
  const parsed = await readBoundedJson(request, 32_768);
  if (!parsed.ok) return noStoreJson({ ok: false, error: parsed.error }, { status: parsed.status });
  const payload = parsed.value;
  const slug = clean(payload.slug, 120);
  const sessionToken = clean(payload.sessionToken, 80);
  if (!isValidPublicSlug(slug) || !UUID_PATTERN.test(sessionToken)) return noStoreJson({ ok: false, error: "Sessão de carrinho inválida." }, { status: 400 });

  const clinic = await getClinic(slug);
  if (!clinic) return noStoreJson({ ok: false, error: "Lojinha indisponível." }, { status: 404 });
  const rateLimit = await consumePublicRateLimit({ scope: "cart_write", headers: request.headers, tenantId: clinic.id });
  if (!rateLimit.allowed) return publicRateLimitResponse(rateLimit);

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (!Array.isArray(payload.items) || rawItems.length > 50 || rawItems.some((item) => {
    const id = String(item?.id || item?.produto_id || "");
    const quantity = Number(item?.quantidade ?? item?.quantity);
    return !UUID_PATTERN.test(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99;
  })) return noStoreJson({ ok: false, error: "Itens do carrinho inválidos." }, { status: 400 });
  const ids = rawItems.map((item) => String(item?.id || item?.produto_id || ""));
  const products = await getProducts(clinic.id, Array.from(new Set(ids)));
  const items = normalizePublicCartItems(rawItems, products);
  const subtotal = items.reduce((sum, item) => sum + item.preco * item.quantidade, 0);
  const consent = payload.consentimentoRecuperacao === true;
  const now = new Date().toISOString();

  const row = {
    clinica_id: clinic.id,
    sessao_token: sessionToken,
    status: items.length ? "ativo" : "descartado",
    nome: consent ? clean(payload.nome, 160) || null : null,
    telefone: consent ? clean(payload.telefone, 40) || null : null,
    email: consent ? clean(payload.email, 180).toLowerCase() || null : null,
    consentimento_recuperacao: consent,
    consentimento_em: consent ? now : null,
    itens,
    subtotal: Number(subtotal.toFixed(2)),
    cupom_codigo: clean(payload.cupomCodigo, 60).toUpperCase() || null,
    origem: safePublicOriginMetadata(payload.origem),
    ultima_interacao_em: now,
  };

  const { data, error } = await supabaseAdmin
    .from("carrinhos_abandonados_clinica")
    .upsert(row, { onConflict: "clinica_id,sessao_token" })
    .select("sessao_token, token_recuperacao")
    .single();
  if (error) throw error;
  return noStoreJson({ ok: true, sessionToken: data.sessao_token, recoveryToken: data.token_recuperacao, items });
}
