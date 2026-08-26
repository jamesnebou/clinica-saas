"use server";

import { revalidatePath } from "next/cache";
import { requireClinicSection } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const text = (fd,key) => String(fd.get(key) || "").trim();
const nullable = (fd,key) => text(fd,key) || null;
const number = (fd,key) => Number(fd.get(key) || 0);
async function scope() { const context=await requireClinicSection("financeiro"); return { supabase:await createClient(), clinicId:context.activeClinic.id }; }
function refresh() { revalidatePath("/dashboard/financeiro", "layout"); }

export async function createReceivableAction(fd) {
  const {supabase,clinicId}=await scope();
  const {error}=await supabase.rpc("finance_criar_recebivel_parcelado",{p_clinica_id:clinicId,p_descricao:text(fd,"descricao"),p_origem_tipo:"manual",p_origem_id:crypto.randomUUID(),p_valor:number(fd,"valor"),p_primeiro_vencimento:text(fd,"vencimento"),p_parcelas:Math.max(1,number(fd,"parcelas")),p_categoria_codigo:text(fd,"categoria_codigo")||"REC_SERVICOS",p_cliente_id:nullable(fd,"cliente_id"),p_metadata:{manual:true}});
  if(error) throw error; refresh();
}
export async function createPayableAction(fd) {
  const {supabase,clinicId}=await scope();
  const {error}=await supabase.rpc("finance_criar_pagavel",{p_clinica_id:clinicId,p_descricao:text(fd,"descricao"),p_origem_tipo:"manual",p_origem_id:crypto.randomUUID(),p_valor:number(fd,"valor"),p_primeiro_vencimento:text(fd,"vencimento"),p_categoria_id:text(fd,"categoria_id"),p_centro_custo_id:nullable(fd,"centro_custo_id"),p_fornecedor_id:nullable(fd,"fornecedor_id"),p_competencia:nullable(fd,"competencia"),p_parcelas:Math.max(1,number(fd,"parcelas")),p_metadata:{manual:true}});
  if(error) throw error; refresh();
}
export async function settlePayableAction(fd) {
  const {supabase,clinicId}=await scope(); const {error}=await supabase.rpc("finance_liquidar_pagavel",{p_clinica_id:clinicId,p_pagavel_id:text(fd,"pagavel_id"),p_valor:number(fd,"valor"),p_conta_id:nullable(fd,"conta_id"),p_forma_pagamento:nullable(fd,"forma_pagamento"),p_data_liquidacao:new Date().toISOString(),p_idempotency_key:crypto.randomUUID(),p_metadata:{source:"dashboard"}}); if(error) throw error; refresh();
}
export async function settleReceivableAction(fd) {
  const {supabase,clinicId}=await scope();
  const {error}=await supabase.rpc("finance_liquidar_recebivel",{p_clinica_id:clinicId,p_recebivel_id:text(fd,"recebivel_id"),p_valor:number(fd,"valor"),p_conta_id:nullable(fd,"conta_id"),p_forma_pagamento:nullable(fd,"forma_pagamento"),p_taxa:number(fd,"taxa"),p_idempotency_key:crypto.randomUUID(),p_metadata:{source:"dashboard"}});
  if(error) throw error; refresh();
}
export async function transferAction(fd) {
  const {supabase,clinicId}=await scope(); const {error}=await supabase.rpc("finance_transferir",{p_clinica_id:clinicId,p_conta_origem_id:text(fd,"conta_origem_id"),p_conta_destino_id:text(fd,"conta_destino_id"),p_valor:number(fd,"valor"),p_data:new Date().toISOString(),p_descricao:text(fd,"descricao")||"Transferência entre contas",p_idempotency_key:crypto.randomUUID()}); if(error) throw error; refresh();
}
export async function reconcileAction(fd) { const {supabase,clinicId}=await scope(); const {error}=await supabase.from("finance_conciliacoes").update({status:"conciliado",conciliado_em:new Date().toISOString()}).eq("clinica_id",clinicId).eq("id",text(fd,"id")); if(error) throw error; refresh(); }
export async function saveFinanceSettingsAction(fd) { const {supabase,clinicId}=await scope(); const {error}=await supabase.from("finance_configuracoes").upsert({clinica_id:clinicId,regime:text(fd,"regime")||"caixa",dia_fechamento:Math.min(28,Math.max(1,number(fd,"dia_fechamento"))),reconhecer_receita_agendamento_em:text(fd,"reconhecer_receita_agendamento_em")||"conclusao",comissao_padrao_percentual:number(fd,"comissao_padrao_percentual")}); if(error) throw error; refresh(); }
export async function createAccountAction(fd) { const {supabase,clinicId}=await scope(); const {error}=await supabase.from("finance_contas").insert({clinica_id:clinicId,nome:text(fd,"nome"),tipo:text(fd,"tipo")||"banco",instituicao:nullable(fd,"instituicao"),saldo_inicial:number(fd,"saldo_inicial")}); if(error) throw error; refresh(); }
export async function recognizePackageSessionAction(fd) { const {supabase,clinicId}=await scope(); const {error}=await supabase.rpc("finance_reconhecer_sessao_pacote",{p_clinica_id:clinicId,p_cliente_pacote_id:text(fd,"cliente_pacote_id"),p_sessao:number(fd,"sessao"),p_competencia:nullable(fd,"competencia")||new Date().toISOString().slice(0,10)}); if(error) throw error; refresh(); }

export async function createFinanceCategoryAction(fd) {
  const { supabase, clinicId } = await scope();
  const { error } = await supabase.from("finance_categorias").insert({
    clinica_id: clinicId,
    nome: text(fd, "nome"),
    codigo: nullable(fd, "codigo"),
    tipo: text(fd, "tipo") || "despesa",
    grupo_dre: text(fd, "grupo_dre") || "despesas_operacionais",
  });
  if (error) throw error;
  refresh();
}

export async function createCostCenterAction(fd) {
  const { supabase, clinicId } = await scope();
  const { error } = await supabase.from("finance_centros_custo").insert({ clinica_id: clinicId, nome: text(fd, "nome"), codigo: nullable(fd, "codigo") });
  if (error) throw error;
  refresh();
}

export async function createSupplierAction(fd) {
  const { supabase, clinicId } = await scope();
  const { error } = await supabase.from("finance_fornecedores").insert({ clinica_id: clinicId, nome: text(fd, "nome"), documento: nullable(fd, "documento"), telefone: nullable(fd, "telefone"), email: nullable(fd, "email") });
  if (error) throw error;
  refresh();
}

export async function createCommissionRuleAction(fd) {
  const { supabase, clinicId } = await scope();
  const ruleType = text(fd, "tipo") || "percentual";
  const { error } = await supabase.from("finance_comissao_regras").insert({
    clinica_id: clinicId,
    profissional_id: nullable(fd, "profissional_id"),
    procedimento_id: nullable(fd, "procedimento_id"),
    tipo: ruleType,
    percentual: ruleType === "percentual" ? number(fd, "percentual") : 0,
    valor_fixo: ruleType === "fixo" ? number(fd, "valor_fixo") : 0,
    base_calculo: text(fd, "base_calculo") || "recebido_liquido",
    prioridade: number(fd, "prioridade"),
    vigencia_inicio: nullable(fd, "vigencia_inicio"),
    vigencia_fim: nullable(fd, "vigencia_fim"),
  });
  if (error) throw error;
  refresh();
}

export async function createRecurrenceAction(fd) {
  const { supabase, clinicId } = await scope();
  const nextDue = text(fd, "proximo_vencimento");
  const { error } = await supabase.from("finance_recorrencias").insert({
    clinica_id: clinicId,
    tipo: text(fd, "tipo") || "pagar",
    descricao: text(fd, "descricao"),
    fornecedor_id: nullable(fd, "fornecedor_id"),
    categoria_id: text(fd, "categoria_id"),
    centro_custo_id: nullable(fd, "centro_custo_id"),
    conta_financeira_id: nullable(fd, "conta_financeira_id"),
    valor: number(fd, "valor"),
    periodicidade: text(fd, "periodicidade") || "mensal",
    dia_vencimento: number(fd, "dia_vencimento") || Number(nextDue.slice(8, 10)),
    proxima_competencia: text(fd, "proxima_competencia") || `${nextDue.slice(0, 7)}-01`,
    proximo_vencimento: nextDue,
    termina_em: nullable(fd, "termina_em"),
  });
  if (error) throw error;
  refresh();
}
