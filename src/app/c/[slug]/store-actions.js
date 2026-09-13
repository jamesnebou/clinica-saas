"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAsaasCheckoutForOrder, isAsaasConfigured } from "@/lib/asaas/client";
import { createInfinitePayCheckout } from "@/lib/infinitepay/client";
import { resolveClinicPaymentProvider } from "@/lib/payments/provider";
import { decryptClinicSecrets } from "@/lib/security/clinic-secrets";
import { getStoreConfig } from "@/lib/store/config";
import { getTrustedAppOrigin } from "@/lib/security/app-origin";
import { consumePublicRateLimit, hashPublicRateLimitValue } from "@/lib/security/public-antiabuse";
import { isValidPublicSlug, looksLikeAutomatedForm, validPublicForm } from "@/lib/security/public-antiabuse-core.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(formData, key, max = 500) {
  return String(formData.get(key) || "").trim().slice(0, max);
}

function nullableText(formData, key, max = 500) {
  return text(formData, key, max) || null;
}

function redirectCheckout(slug, code, message) {
  const query = new URLSearchParams({ erro: code, mensagem: message }).toString();
  redirect(`/c/${slug}/checkout?${query}`);
}

function normalizeLocation(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 20);
}

async function getOrigin() {
  return getTrustedAppOrigin();
}

function redirectExistingOrder(slug, order) {
  if (order?.invoice_url && order.pagamento_status === "pendente" && !["cancelado", "estornado"].includes(order.status)) redirect(order.invoice_url);
  redirect(`/c/${slug}/pedido/${order.token_publico}`);
}

async function getClinicIntegration(clinicId) {
  const { data, error } = await supabaseAdmin
    .from("clinica_integracoes")
    .select("clinica_id, pagamento_gateway, asaas_ativo, asaas_base_url, asaas_configuracao_publica, asaas_segredos_criptografados, asaas_api_key, infinitepay_ativo, infinitepay_handle, infinitepay_configuracao_publica")
    .eq("clinica_id", clinicId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { clinica_id: clinicId, asaas_ativo: false, infinitepay_ativo: false };
  const secrets = decryptClinicSecrets(data.asaas_segredos_criptografados);
  return {
    ...data,
    clinica_id: clinicId,
    asaas_ativo: data.asaas_ativo,
    baseUrl: data.asaas_configuracao_publica?.baseUrl || data.asaas_base_url,
    apiKey: secrets.apiKey || data.asaas_api_key,
  };
}

async function findOrCreateClient({ clinicId, nome, telefone, email, cpf }) {
  let query = supabaseAdmin.from("clientes").select("id").eq("clinica_id", clinicId).limit(1);
  if (email) query = query.eq("email", email);
  else query = query.eq("telefone", telefone);
  const { data: existing, error: existingError } = await query;
  if (existingError) throw existingError;
  if (existing?.[0]?.id) return existing[0].id;

  const { data, error } = await supabaseAdmin
    .from("clientes")
    .insert({
      clinica_id: clinicId,
      nome,
      telefone,
      email: email || null,
      cpf: cpf || null,
      origem: "site",
      status: "ativo",
      consentimento_lgpd: true,
      data_consentimento_lgpd: new Date().toISOString(),
      observacoes: "Cliente criado automaticamente pelo checkout da lojinha.",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

function parseItems(formData, slug) {
  let items;
  try {
    items = JSON.parse(text(formData, "items_json", 30000));
  } catch {
    redirectCheckout(slug, "carrinho", "O carrinho não pôde ser lido. Volte à lojinha e tente novamente.");
  }
  if (!Array.isArray(items) || !items.length || items.length > 50) {
    redirectCheckout(slug, "carrinho", "Seu carrinho está vazio ou inválido.");
  }
  const normalized = items.map((item) => ({
    produto_id: String(item?.produto_id || item?.id || ""),
    quantidade: Number(item?.quantidade),
  }));
  if (normalized.some((item) => !UUID_PATTERN.test(item.produto_id) || !Number.isInteger(item.quantidade) || item.quantidade <= 0 || item.quantidade > 99)) {
    redirectCheckout(slug, "carrinho", "Seu carrinho contém itens inválidos.");
  }
  return normalized;
}

async function markCartConverted({ clinicId, sessionToken, orderId }) {
  if (!UUID_PATTERN.test(sessionToken)) return;
  await supabaseAdmin
    .from("carrinhos_abandonados_clinica")
    .update({ status: "convertido", pedido_id: orderId, convertido_em: new Date().toISOString() })
    .eq("clinica_id", clinicId)
    .eq("sessao_token", sessionToken);
}

export async function createPublicStoreOrderAction(formData) {
  if (!validPublicForm(formData) || !isValidPublicSlug(formData.get("slug"))) redirect("/");
  const slug = text(formData, "slug", 80);
  const nome = text(formData, "nome", 120);
  const telefone = normalizePhone(text(formData, "telefone", 40));
  const email = text(formData, "email", 254).toLowerCase();
  const cpf = text(formData, "cpf", 30).replace(/\D/g, "");
  const entregaTipo = text(formData, "entrega_tipo", 20) || "retirada";
  const formaPagamento = text(formData, "forma_pagamento", 30) || "PIX";
  const consentimento = formData.get("consentimento_lgpd") === "on";
  const cartToken = text(formData, "cart_token", 80);
  const submittedRequestId = text(formData, "order_request_id", 80);
  const requestId = UUID_PATTERN.test(submittedRequestId)
    ? submittedRequestId
    : UUID_PATTERN.test(cartToken) ? cartToken : "";
  if (looksLikeAutomatedForm(formData)) redirect(`/c/${slug}/loja`);
  const items = parseItems(formData, slug);
  if (!isValidPublicSlug(slug) || !nome || nome.length < 2 || telefone.length < 10 || (email && !/^\S+@\S+\.\S+$/.test(email)) || !requestId) {
    redirectCheckout(slug, "dados", "Informe nome e WhatsApp para concluir o pedido.");
  }
  if (!consentimento) redirectCheckout(slug, "lgpd", "Aceite a política de privacidade para concluir a compra.");
  if (!["retirada", "entrega"].includes(entregaTipo)) redirectCheckout(slug, "entrega", "Escolha uma forma de entrega disponível.");

  const { data: clinic, error: clinicError } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, status, email, telefone, metadata")
    .eq("slug", slug)
    .in("status", ["trial", "ativa"])
    .maybeSingle();
  if (clinicError) throw clinicError;
  if (!clinic || clinic.metadata?.site_publico?.publicado === false || clinic.metadata?.site_publico?.lojinha_ativa === false) {
    redirectCheckout(slug, "loja", "A lojinha está indisponível no momento.");
  }

  const orderRateLimit = await consumePublicRateLimit({
    scope: "store_order_create",
    headers: await headers(),
    tenantId: clinic.id,
    target: telefone,
  });
  if (!orderRateLimit.allowed) {
    redirectCheckout(slug, "limite", "Muitas tentativas. Aguarde alguns instantes e tente novamente.");
  }

  const checkoutRequestId = hashPublicRateLimitValue("checkout-idempotency", JSON.stringify([requestId, telefone, email]));
  const findExistingOrder = () => supabaseAdmin
    .from("pedidos_clinica")
    .select("id, token_publico, status, pagamento_status, invoice_url")
    .eq("clinica_id", clinic.id)
    .eq("origem->>checkout_request_id", checkoutRequestId)
    .maybeSingle();
  const { data: existingOrder, error: existingOrderError } = await findExistingOrder();
  if (existingOrderError) throw existingOrderError;
  if (existingOrder) redirectExistingOrder(slug, existingOrder);

  const config = getStoreConfig(clinic.metadata?.site_publico);
  if (entregaTipo === "retirada" && !config.retiradaAtiva) redirectCheckout(slug, "entrega", "A retirada não está disponível.");
  if (entregaTipo === "entrega" && !config.entregaAtiva) redirectCheckout(slug, "entrega", "A entrega não está disponível.");
  if (formaPagamento === "PAGAR_NA_RETIRADA" && (!config.pagamentoRetiradaAtivo || entregaTipo !== "retirada")) {
    redirectCheckout(slug, "pagamento", "O pagamento na retirada não está disponível para este pedido.");
  }
  const onlinePaymentAllowed = (formaPagamento === "PIX" && config.pixAtivo) || (formaPagamento === "CREDIT_CARD" && config.cartaoAtivo);
  if (formaPagamento !== "PAGAR_NA_RETIRADA" && (!config.checkoutAsaasAtivo || !onlinePaymentAllowed)) {
    redirectCheckout(slug, "pagamento", "Escolha uma forma de pagamento disponível.");
  }

  const address = {
    cep: nullableText(formData, "cep", 20),
    endereco: nullableText(formData, "endereco", 240),
    numero: nullableText(formData, "numero_endereco", 30),
    complemento: nullableText(formData, "complemento", 120),
    bairro: nullableText(formData, "bairro", 120),
    cidade: nullableText(formData, "cidade", 120),
    estado: nullableText(formData, "estado", 2)?.toUpperCase() || null,
    referencia: nullableText(formData, "referencia_entrega", 240),
  };
  if (entregaTipo === "entrega" && (!address.cep || !address.endereco || !address.numero || !address.bairro || !address.cidade || !address.estado)) {
    redirectCheckout(slug, "endereco", "Preencha o endereço completo para receber o pedido.");
  }
  if (entregaTipo === "entrega" && config.entregaCidade && normalizeLocation(address.cidade) !== normalizeLocation(config.entregaCidade)) {
    redirectCheckout(slug, "entrega", `A entrega está disponível somente em ${config.entregaCidade}.`);
  }
  if (entregaTipo === "entrega" && config.bairrosEntrega.length && !config.bairrosEntrega.some((bairro) => normalizeLocation(bairro) === normalizeLocation(address.bairro))) {
    redirectCheckout(slug, "entrega", "O bairro informado ainda não está na área de entrega da clínica.");
  }

  const { data: products, error: productsError } = await supabaseAdmin
    .from("produtos_clinica")
    .select("id, preco, estoque_atual, estoque_reservado")
    .eq("clinica_id", clinic.id)
    .eq("ativo", true)
    .eq("publicado_site", true)
    .in("id", items.map((item) => item.produto_id));
  if (productsError) throw productsError;
  if (new Set(items.map((item) => item.produto_id)).size !== items.length
    || products?.length !== items.length) {
    redirectCheckout(slug, "carrinho", "Um ou mais produtos estão indisponíveis.");
  }
  const quantities = new Map(items.map((item) => [item.produto_id, item.quantidade]));
  const estimatedSubtotal = (products || []).reduce((sum, product) => sum + Number(product.preco || 0) * Number(quantities.get(product.id) || 0), 0);
  if (estimatedSubtotal < config.pedidoMinimo) {
    redirectCheckout(slug, "minimo", `O pedido mínimo da lojinha é ${config.pedidoMinimo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
  }

  const clienteId = await findOrCreateClient({ clinicId: clinic.id, nome, telefone, email, cpf });
  const freeShipping = entregaTipo === "entrega" && config.freteGratisAcima > 0 && estimatedSubtotal >= config.freteGratisAcima;
  const freight = entregaTipo === "entrega" && !freeShipping ? config.taxaEntrega : 0;
  const { data: createdRows, error: createError } = await supabaseAdmin.rpc("criar_pedido_loja", {
    p_clinica_id: clinic.id,
    p_cliente_id: clienteId,
    p_itens: items,
    p_nome: nome,
    p_telefone: telefone,
    p_email: email || null,
    p_cpf: cpf || null,
    p_entrega_tipo: entregaTipo,
    p_frete: freight,
    p_cep: address.cep,
    p_endereco: address.endereco,
    p_numero_endereco: address.numero,
    p_complemento: address.complemento,
    p_bairro: address.bairro,
    p_cidade: address.cidade,
    p_estado: address.estado,
    p_referencia_entrega: address.referencia,
    p_cupom_codigo: nullableText(formData, "cupom_codigo", 60)?.toUpperCase() || null,
    p_forma_pagamento: formaPagamento,
    p_reserva_minutos: config.reservaMinutos,
    p_origem: {
      canal: "site",
      cart_token: UUID_PATTERN.test(cartToken) ? cartToken : null,
      checkout_request_id: checkoutRequestId,
    },
  });
  if (createError?.code === "23505") {
    const { data: concurrentOrder } = await findExistingOrder();
    if (concurrentOrder) redirectExistingOrder(slug, concurrentOrder);
  }
  if (createError) redirectCheckout(slug, "pedido", "Não foi possível criar o pedido. Confira o carrinho e tente novamente.");
  const order = createdRows?.[0];
  if (!order?.pedido_id) redirectCheckout(slug, "pedido", "Não foi possível criar o pedido.");

  const orderUrl = `/c/${slug}/pedido/${order.token_publico}`;

  if (Number(order.total || 0) <= 0) {
    const { error: freeOrderError } = await supabaseAdmin.rpc("confirmar_pagamento_pedido_loja", {
      p_pedido_id: order.pedido_id,
      p_asaas_payment_id: null,
      p_payload: { origem: "checkout", motivo: "pedido_sem_saldo" },
    });
    if (freeOrderError) {
      await supabaseAdmin.rpc("cancelar_pedido_loja", { p_pedido_id: order.pedido_id, p_motivo: "Falha ao confirmar pedido sem saldo." });
      redirectCheckout(slug, "pedido", "Não foi possível confirmar o pedido. Tente novamente.");
    }
    await markCartConverted({ clinicId: clinic.id, sessionToken: cartToken, orderId: order.pedido_id });
    revalidatePath(`/c/${slug}`);
    revalidatePath("/dashboard/pedidos");
    redirect(orderUrl);
  }

  if (formaPagamento === "PAGAR_NA_RETIRADA") {
    await supabaseAdmin.from("pedidos_clinica").update({ status: "confirmado", pagamento_status: "pagar_na_retirada", expiracao_reserva_em: null }).eq("id", order.pedido_id);
    await markCartConverted({ clinicId: clinic.id, sessionToken: cartToken, orderId: order.pedido_id });
    revalidatePath(`/c/${slug}`);
    revalidatePath("/dashboard/pedidos");
    redirect(orderUrl);
  }

  const integration = await getClinicIntegration(clinic.id);
  const paymentProvider = resolveClinicPaymentProvider(integration);
  if (!config.checkoutAsaasAtivo || !paymentProvider) {
    await supabaseAdmin.rpc("cancelar_pedido_loja", { p_pedido_id: order.pedido_id, p_motivo: "Checkout online indisponível." });
    redirectCheckout(slug, "pagamento", "O pagamento online está indisponível. Escolha pagar na retirada ou fale com a clínica.");
  }

  let paymentRedirectUrl = orderUrl;
  try {
    const origin = await getOrigin();
    const callbackUrl = `${origin}${orderUrl}`;
    const orderNsu = `loja:${order.pedido_id}`;
    const checkout = paymentProvider === "asaas" && isAsaasConfigured(integration)
      ? await createAsaasCheckoutForOrder({
          value: order.total,
          description: `Pedido #${order.numero} - ${clinic.nome}`,
          externalReference: orderNsu,
          billingTypes: [formaPagamento],
          minutesToExpire: config.reservaMinutos,
          callback: {
            successUrl: callbackUrl,
            cancelUrl: callbackUrl,
            expiredUrl: callbackUrl,
          },
          customerData: { name: nome, email, phone: telefone, cpfCnpj: cpf },
          integration,
        })
      : await createInfinitePayCheckout({
          handle: integration.infinitepay_handle,
          orderNsu,
          redirectUrl: callbackUrl,
          webhookUrl: `${origin}/api/webhooks/infinitepay`,
          items: [{
            quantity: 1,
            price: Math.round(Number(order.total || 0) * 100),
            description: `Pedido #${order.numero} - ${clinic.nome}`,
          }],
          customer: { name: nome, email, phone: telefone },
        });
    const checkoutUrl = paymentProvider === "asaas" ? checkout.link : checkout.url;
    if (!checkoutUrl) throw new Error("O gateway não retornou o link do checkout.");

    const { error: orderUpdateError } = await supabaseAdmin.from("pedidos_clinica").update({
      pagamento_gateway: paymentProvider,
      pagamento_external_id: paymentProvider === "infinitepay" ? orderNsu : null,
      asaas_payment_id: null,
      invoice_url: checkoutUrl,
      payload_pagamento: { pagamento_gateway: paymentProvider, checkout },
    }).eq("id", order.pedido_id).eq("clinica_id", clinic.id);
    if (orderUpdateError) throw orderUpdateError;

    await markCartConverted({ clinicId: clinic.id, sessionToken: cartToken, orderId: order.pedido_id });
    revalidatePath(`/c/${slug}`);
    revalidatePath("/dashboard/pedidos");
    paymentRedirectUrl = checkoutUrl;
  } catch {
    await supabaseAdmin.rpc("cancelar_pedido_loja", { p_pedido_id: order.pedido_id, p_motivo: `Falha ao gerar checkout ${paymentProvider}.` });
    redirectCheckout(slug, "pagamento", "Não foi possível gerar o pagamento. Consulte a clínica antes de tentar novamente.");
  }

  redirect(paymentRedirectUrl);
}
