import { supabaseAdmin } from "@/lib/supabase/admin";
import { isFinanceSchemaMissing } from "@/lib/finance/service";

async function defaults(clinicId, categoryCode) {
  const [category, account, center] = await Promise.all([
    supabaseAdmin.from("finance_categorias").select("id").eq("clinica_id",clinicId).eq("codigo",categoryCode).maybeSingle(),
    supabaseAdmin.from("finance_contas").select("id").eq("clinica_id",clinicId).eq("padrao",true).eq("ativa",true).maybeSingle(),
    supabaseAdmin.from("finance_centros_custo").select("id").eq("clinica_id",clinicId).eq("codigo","CLINICA").maybeSingle(),
  ]);
  const error=[category.error,account.error,center.error].find(Boolean);
  if(error) throw error;
  return {categoryId:category.data?.id,accountId:account.data?.id,centerId:center.data?.id};
}

async function syncCanonical({clinicId,originType,originId,description,value,paidValue,clientId,professionalId,procedureId,appointmentId,orderId,categoryCode,provider,providerReference,paidAt,paymentMethod,metadata}) {
  try {
    const d=await defaults(clinicId,categoryCode);
    if(!d.categoryId) throw new Error(`Categoria financeira ${categoryCode} não configurada.`);
    const {data:receivable,error}=await supabaseAdmin.from("finance_recebiveis").upsert({clinica_id:clinicId,cliente_id:clientId||null,profissional_id:professionalId||null,procedimento_id:procedureId||null,agendamento_id:appointmentId||null,pedido_id:orderId||null,categoria_id:d.categoryId,centro_custo_id:d.centerId||null,descricao:description,origem_tipo:originType,origem_id:String(originId),valor_original:Number(value||0),vencimento:(paidAt||new Date().toISOString()).slice(0,10),provider:provider||null,provider_reference:providerReference||null,metadata:{...(metadata||{}),dual_write:true}},{onConflict:"clinica_id,origem_tipo,origem_id"}).select("id,valor_total,valor_recebido,status").single();
    if(error) throw error;
    if(receivable.status==="cancelado") {
      const {error:reopenError}=await supabaseAdmin.from("finance_recebiveis").update({status:"aberto"}).eq("clinica_id",clinicId).eq("id",receivable.id);
      if(reopenError) throw reopenError;
      receivable.status="aberto";
    }
    const open=Math.max(0,Number(receivable.valor_total||0)-Number(receivable.valor_recebido||0));
    const amount=Math.min(open,Number(paidValue||0));
    if(amount<=0) return {receivableId:receivable.id,settled:false};
    const {error:settleError}=await supabaseAdmin.rpc("finance_liquidar_recebivel",{p_clinica_id:clinicId,p_recebivel_id:receivable.id,p_valor:amount,p_conta_id:d.accountId||null,p_forma_pagamento:paymentMethod||null,p_data_liquidacao:paidAt||new Date().toISOString(),p_taxa:0,p_provider:provider||null,p_provider_reference:providerReference||null,p_idempotency_key:`${provider||"manual"}:${providerReference||originType+":"+originId}:${amount}`,p_metadata:{...(metadata||{}),dual_write:true}});
    if(settleError) throw settleError;
    return {receivableId:receivable.id,settled:true};
  } catch(error) {
    if(isFinanceSchemaMissing(error)) return {skipped:true,reason:"schema_missing"};
    throw error;
  }
}

export async function syncCanonicalAppointmentPayment({clinicId,appointmentId,value,paidValue,clientId,professionalId,procedureId,description,provider,providerReference,paidAt,paymentMethod,metadata}) {
  return syncCanonical({clinicId,originType:"agendamento",originId:appointmentId,description:description||"Atendimento",value,paidValue,clientId,professionalId,procedureId,appointmentId,categoryCode:"REC_SERVICOS",provider,providerReference,paidAt,paymentMethod,metadata});
}
export async function syncCanonicalOrderPayment({clinicId,orderId,value,paidValue,clientId,description,provider,providerReference,paidAt,paymentMethod,metadata}) {
  return syncCanonical({clinicId,originType:"ecommerce",originId:orderId,description:description||`Pedido ${orderId}`,value,paidValue,clientId,orderId,categoryCode:"REC_PRODUTOS",provider,providerReference,paidAt,paymentMethod,metadata});
}
export async function syncCanonicalPackagePayment({clinicId,clientPackageId,value,paidValue,clientId,description,paidAt,paymentMethod,metadata}) {
  return syncCanonical({clinicId,originType:"cliente_pacote",originId:clientPackageId,description, value,paidValue,clientId,categoryCode:"REC_PACOTES",provider:"manual",providerReference:`pacote:${clientPackageId}:${paidValue}`,paidAt,paymentMethod,metadata:{...(metadata||{}),cliente_pacote_id:clientPackageId}});
}

export async function cancelCanonicalReceivableByOrigin({clinicId,originType,originId,reason}) {
  try {
    const { data, error } = await supabaseAdmin.rpc("finance_cancelar_recebivel_origem", {
      p_clinica_id: clinicId,
      p_origem_tipo: originType,
      p_origem_id: String(originId),
      p_motivo: reason || "Cancelamento da origem",
    });
    if (error) throw error;
    return data;
  } catch (error) {
    if (isFinanceSchemaMissing(error)) return { skipped: true, reason: "schema_missing" };
    throw error;
  }
}
