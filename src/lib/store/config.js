export function getStoreConfig(site = {}) {
  const config = site?.lojinha_config || {};
  const number = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  const neighborhoods = Array.isArray(config.bairros_entrega)
    ? config.bairros_entrega
    : String(config.bairros_entrega || "").split(/[\n,;]+/);

  return {
    retiradaAtiva: config.retirada_ativa !== false,
    entregaAtiva: config.entrega_ativa === true,
    entregaModo: config.entrega_modo === "motoboy" ? "motoboy" : "propria",
    taxaEntrega: number(config.taxa_entrega, 0),
    freteGratisAcima: number(config.frete_gratis_acima, 0),
    pedidoMinimo: number(config.pedido_minimo, 0),
    pagamentoRetiradaAtivo: config.pagamento_retirada_ativo !== false,
    checkoutAsaasAtivo: config.checkout_asaas_ativo !== false,
    pixAtivo: config.pix_ativo !== false,
    cartaoAtivo: config.cartao_ativo !== false,
    reservaMinutos: number(config.reserva_minutos, 30, 10, 240),
    mensagemRetirada: String(config.mensagem_retirada || "Avisaremos quando o pedido estiver pronto para retirada.").trim(),
    prazoEntrega: String(config.prazo_entrega || "Entrega combinada diretamente com a clínica.").trim(),
    mensagemEntrega: String(config.mensagem_entrega || "A clínica confirmará o envio pelo WhatsApp.").trim(),
    entregaCidade: String(config.entrega_cidade || "").trim(),
    bairrosEntrega: neighborhoods.map((item) => String(item || "").trim()).filter(Boolean),
  };
}

export function availableProductStock(product) {
  return Math.max(0, Math.floor(Number(product?.estoque_atual || 0) - Number(product?.estoque_reservado || 0)));
}

export function normalizePublicCartItems(items, products) {
  const productsById = new Map((products || []).map((product) => [product.id, product]));
  const totals = new Map();

  for (const item of Array.isArray(items) ? items.slice(0, 50) : []) {
    const id = String(item?.id || item?.produto_id || "");
    const product = productsById.get(id);
    if (!product) continue;
    const quantity = Math.max(0, Math.min(99, Math.floor(Number(item?.quantidade || item?.quantity || 0))));
    if (!quantity) continue;
    totals.set(id, Math.min(availableProductStock(product), (totals.get(id) || 0) + quantity));
  }

  return Array.from(totals.entries()).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => {
    const product = productsById.get(id);
    return {
      id,
      produto_id: id,
      nome: product.nome,
      categoria: product.categoria || "Cuidados",
      imagem_url: product.imagem_url || "",
      preco: Number(product.preco || 0),
      quantidade: quantity,
      estoque_disponivel: availableProductStock(product),
    };
  });
}
