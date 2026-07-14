"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClinic } from "@/lib/auth/session";
import { assertSectionAccess, getCurrentMembership } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decryptClinicSecrets } from "@/lib/security/clinic-secrets";
import { refundAsaasPayment } from "@/lib/asaas/client";

function text(formData, key, max = 500) {
  return String(formData.get(key) || "").trim().slice(0, max);
}

function numberValue(formData, key, fallback = 0) {
  const value = Number(text(formData, key).replace(",", "."));
  return Number.isFinite(value) ? value : fallback;
}

function redirectMessage(type, message) {
  const query = new URLSearchParams({ [type]: "1", mensagem: message }).toString();
  redirect(`/dashboard/pedidos?${query}`);
}

async function getContext(managerOnly = false) {
  const context = await requireClinic();
  const clinicId = context.activeClinic?.id;
  if (!clinicId) redirect("/login-cliente");
  const membership = getCurrentMembership(context.memberships, clinicId);
  assertSectionAccess(membership?.papel || "recepcao", "pedidos", membership);
  if (managerOnly && !["owner", "admin"].includes(membership?.papel)) {
    redirectMessage("erro", "Somente proprietário ou administrador pode realizar esta ação.");
  }
  return { clinicId, clinic: context.activeClinic, membership };
}

export async function updateStoreOrderStatusAction(formData) {
  const { clinicId } = await getContext();
  const id = text(formData, "id", 80);
  const status = text(formData, "status", 40);
  const allowed = new Set(["confirmado", "em_separacao", "pronto_retirada", "enviado", "concluido", "cancelado"]);
  if (!allowed.has(status)) redirectMessage("erro", "Status de pedido inválido.");

  const { data: order, error } = await supabaseAdmin.from("pedidos_clinica").select("id, pagamento_status, status").eq("id", id).eq("clinica_id", clinicId).maybeSingle();
  if (error) throw error;
  if (!order) redirectMessage("erro", "Pedido não encontrado.");

  if (status === "cancelado") {
    if (order.pagamento_status === "pago") redirectMessage("erro", "Pedido pago precisa passar pelo estorno financeiro.");
    const { error: cancelError } = await supabaseAdmin.rpc("cancelar_pedido_loja", { p_pedido_id: id, p_motivo: "Cancelado pela equipe no dashboard." });
    if (cancelError) redirectMessage("erro", cancelError.message);
  } else {
    const { error: updateError } = await supabaseAdmin.from("pedidos_clinica").update({ status }).eq("id", id).eq("clinica_id", clinicId);
    if (updateError) redirectMessage("erro", updateError.message);
  }
  revalidatePath("/dashboard/pedidos");
  redirectMessage("ok", "Status do pedido atualizado.");
}

export async function confirmPickupPaymentAction(formData) {
  const { clinicId } = await getContext();
  const id = text(formData, "id", 80);
  const { data: order, error } = await supabaseAdmin.from("pedidos_clinica").select("id, cliente_id, total, pagamento_status").eq("id", id).eq("clinica_id", clinicId).maybeSingle();
  if (error) throw error;
  if (!order) redirectMessage("erro", "Pedido não encontrado.");
  if (order.pagamento_status === "pago") redirectMessage("ok", "Este pedido já está pago.");

  const manualId = `retirada:${id}`;
  const { error: rpcError } = await supabaseAdmin.rpc("confirmar_pagamento_pedido_loja", {
    p_pedido_id: id,
    p_asaas_payment_id: null,
    p_payload: { origem: "dashboard", forma: "retirada" },
    p_pago_em: new Date().toISOString(),
  });
  if (rpcError) redirectMessage("erro", rpcError.message);

  const { error: paymentError } = await supabaseAdmin.from("pagamentos_loja_clinica").upsert({
    clinica_id: clinicId,
    cliente_id: order.cliente_id,
    pedido_id: id,
    valor: order.total,
    forma: "dinheiro",
    status: "pago",
    provedor: "manual",
    provedor_pagamento_id: manualId,
    pago_em: new Date().toISOString(),
    observacoes: "Pagamento na retirada confirmado pelo dashboard.",
  }, { onConflict: "clinica_id,provedor,provedor_pagamento_id" });
  if (paymentError) redirectMessage("erro", paymentError.message);
  revalidatePath("/dashboard/pedidos");
  revalidatePath("/dashboard/produtos");
  redirectMessage("ok", "Pagamento confirmado e estoque baixado.");
}

export async function requestStoreOrderRefundAction(formData) {
  const { clinicId } = await getContext(true);
  const id = text(formData, "id", 80);
  const { data: order } = await supabaseAdmin.from("pedidos_clinica").select("id, asaas_payment_id, pagamento_status, observacoes").eq("id", id).eq("clinica_id", clinicId).maybeSingle();
  if (!order?.asaas_payment_id || order.pagamento_status !== "pago") redirectMessage("erro", "Este pedido não possui pagamento Asaas confirmado para estorno.");

  const { data: integration } = await supabaseAdmin.from("clinica_integracoes")
    .select("clinica_id, asaas_ativo, asaas_base_url, asaas_configuracao_publica, asaas_segredos_criptografados, asaas_api_key")
    .eq("clinica_id", clinicId).eq("asaas_ativo", true).maybeSingle();
  const secrets = integration ? decryptClinicSecrets(integration.asaas_segredos_criptografados) : {};
  const apiKey = secrets.apiKey || integration?.asaas_api_key;
  if (!apiKey) redirectMessage("erro", "Integração Asaas não configurada.");

  try {
    const result = await refundAsaasPayment(order.asaas_payment_id, { clinica_id: clinicId, asaas_ativo: true, baseUrl: integration.asaas_configuracao_publica?.baseUrl || integration.asaas_base_url, apiKey });
    if (String(result?.status || "").toUpperCase() === "REFUNDED") {
      const { error: refundError } = await supabaseAdmin.rpc("estornar_pedido_loja", { p_pedido_id: id, p_motivo: "Estorno confirmado pelo Asaas." });
      if (refundError) throw refundError;
    } else {
      await supabaseAdmin.from("pedidos_clinica").update({ observacoes: [order.observacoes, "Estorno solicitado ao Asaas; aguardando confirmação."].filter(Boolean).join("\n") }).eq("id", id);
    }
  } catch (error) {
    redirectMessage("erro", error.message || "Não foi possível solicitar o estorno.");
  }
  revalidatePath("/dashboard/pedidos");
  redirectMessage("ok", "Solicitação de estorno enviada ao Asaas.");
}

export async function createStoreCouponAction(formData) {
  const { clinicId } = await getContext(true);
  const codigo = text(formData, "codigo", 60).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const tipo = text(formData, "tipo", 20);
  if (!codigo || !["percentual", "fixo"].includes(tipo)) redirectMessage("erro", "Informe um cupom válido.");
  const { error } = await supabaseAdmin.from("cupons_clinica").insert({
    clinica_id: clinicId,
    codigo,
    descricao: text(formData, "descricao", 200) || null,
    tipo,
    valor: Math.max(0, numberValue(formData, "valor")),
    pedido_minimo: Math.max(0, numberValue(formData, "pedido_minimo")),
    desconto_maximo: numberValue(formData, "desconto_maximo") > 0 ? numberValue(formData, "desconto_maximo") : null,
    limite_usos: numberValue(formData, "limite_usos") > 0 ? Math.floor(numberValue(formData, "limite_usos")) : null,
    inicia_em: text(formData, "inicia_em") ? new Date(text(formData, "inicia_em")).toISOString() : null,
    termina_em: text(formData, "termina_em") ? new Date(text(formData, "termina_em")).toISOString() : null,
    ativo: true,
  });
  if (error) redirectMessage("erro", error.message);
  revalidatePath("/dashboard/pedidos");
  redirectMessage("ok", "Cupom criado.");
}

export async function toggleStoreCouponAction(formData) {
  const { clinicId } = await getContext(true);
  const id = text(formData, "id", 80);
  const ativo = text(formData, "ativo") === "true";
  const { error } = await supabaseAdmin.from("cupons_clinica").update({ ativo }).eq("id", id).eq("clinica_id", clinicId);
  if (error) redirectMessage("erro", error.message);
  revalidatePath("/dashboard/pedidos");
  redirectMessage("ok", ativo ? "Cupom ativado." : "Cupom desativado.");
}

export async function openAbandonedCartRecoveryAction(formData) {
  const { clinicId, clinic } = await getContext();
  const id = text(formData, "id", 80);
  const { data: cart } = await supabaseAdmin.from("carrinhos_abandonados_clinica").select("id, telefone, token_recuperacao, quantidade_lembretes").eq("id", id).eq("clinica_id", clinicId).maybeSingle();
  if (!cart?.telefone) redirectMessage("erro", "Este carrinho não possui WhatsApp autorizado.");
  const requestHeaders = await headers();
  const protocol = requestHeaders.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const recoveryUrl = `${protocol}://${host}/c/${clinic.slug}?carrinho=${cart.token_recuperacao}#loja`;
  const message = `Olá! Você deixou produtos no carrinho da ${clinic.nome}. Se quiser concluir sua compra, seu carrinho está salvo aqui: ${recoveryUrl}`;
  await supabaseAdmin.from("carrinhos_abandonados_clinica").update({ lembrete_enviado_em: new Date().toISOString(), quantidade_lembretes: Number(cart.quantidade_lembretes || 0) + 1 }).eq("id", id);
  const phone = String(cart.telefone).replace(/\D/g, "");
  redirect(`https://wa.me/${phone.startsWith("55") ? phone : `55${phone}`}?text=${encodeURIComponent(message)}`);
}
