import { supabaseAdmin } from "@/lib/supabase/admin";
import { isFinanceSchemaMissing } from "@/lib/finance/service";

export async function syncCanonicalAppointmentPayment({clinicId,appointmentId,value,paidValue,clientId,professionalId,procedureId,description,provider,providerReference,paidAt,paymentMethod,metadata}) {
  void clientId; void professionalId; void procedureId;
  try {
    const { data, error } = await supabaseAdmin.rpc("finance_registrar_pagamento_agendamento_v2", {
      p_clinica_id: clinicId,
      p_agendamento_id: appointmentId,
      p_valor_total: Number(value || 0),
      p_valor_pago: Number(paidValue || 0),
      p_descricao: description || "Atendimento",
      p_provider: provider || "manual",
      p_provider_reference: providerReference || `agendamento:${appointmentId}:${paidValue}`,
      p_pago_em: paidAt || new Date().toISOString(),
      p_forma_pagamento: paymentMethod || null,
      p_metadata: { ...(metadata || {}), canonical: true },
    });
    if (error) throw error;
    return data;
  } catch (error) {
    if (isFinanceSchemaMissing(error)) return { skipped: true, reason: "schema_missing" };
    throw error;
  }
}
export async function setCanonicalAppointmentPayment({clinicId,appointmentId,value,paidValue,description,paidAt,paymentMethod,metadata}) {
  const { data, error } = await supabaseAdmin.rpc("finance_definir_pagamento_agendamento_v2", {
    p_clinica_id: clinicId,
    p_agendamento_id: appointmentId,
    p_valor_total: Number(value || 0),
    p_valor_pago_acumulado: Number(paidValue || 0),
    p_descricao: description || "Atendimento",
    p_pago_em: paidAt || new Date().toISOString(),
    p_forma_pagamento: paymentMethod || null,
    p_metadata: { ...(metadata || {}), canonical: true },
  });
  if (error) throw error;
  return data;
}

export async function cancelCanonicalAppointmentPayment({clinicId,appointmentId,reason}) {
  const { data, error } = await supabaseAdmin.rpc("finance_cancelar_pagamento_agendamento_v2", {
    p_clinica_id: clinicId,
    p_agendamento_id: appointmentId,
    p_motivo: reason || "Cancelamento do pagamento",
  });
  if (error) throw error;
  return data;
}
export async function syncCanonicalOrderPayment({clinicId,orderId,value,paidValue,clientId,description,provider,providerReference,paidAt,paymentMethod,metadata}) {
  void paidValue; void clientId; void description;
  const { data, error } = await supabaseAdmin.rpc("finance_registrar_pagamento_pedido_v2", {
    p_clinica_id: clinicId, p_pedido_id: orderId, p_valor: Number(value || 0), p_provider: provider,
    p_provider_reference: providerReference, p_pago_em: paidAt || new Date().toISOString(),
    p_forma: paymentMethod || "link", p_payload: metadata || {},
  });
  if (error) throw error;
  return data;
}

export async function cancelCanonicalOrderPayment({clinicId,orderId,reason,refund=false}) {
  const { data, error } = await supabaseAdmin.rpc("finance_cancelar_pagamento_pedido_v2", {
    p_clinica_id: clinicId, p_pedido_id: orderId, p_motivo: reason, p_estorno: refund,
  });
  if (error) throw error;
  return data;
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
