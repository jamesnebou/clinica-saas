import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function tenantRow(table, clinicId, id, select = "*") {
  if (!id) return null;
  const { data, error } = await supabaseAdmin.from(table).select(select).eq("clinica_id", clinicId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function resolveAutomationContext(event) {
  const { data: clinicWithTimezone, error: clinicError } = await supabaseAdmin
    .from("clinicas")
    .select("id,nome,metadata,timezone")
    .eq("id", event.clinica_id)
    .maybeSingle();
  let clinic = clinicWithTimezone;
  if (clinicError?.code === "42703" || clinicError?.code === "PGRST204") {
    const fallback = await supabaseAdmin.from("clinicas").select("id,nome,metadata").eq("id", event.clinica_id).maybeSingle();
    if (fallback.error) throw fallback.error;
    clinic = fallback.data;
  } else if (clinicError) {
    throw clinicError;
  }
  const context = { event, clinic: clinic || { id: event.clinica_id }, now: new Date().toISOString() };
  if (event.subject.type === "crm_opportunity") {
    context.opportunity = await tenantRow("crm_oportunidades", event.clinica_id, event.subject.id);
    if (context.opportunity?.cliente_id) context.client = await tenantRow("clientes", event.clinica_id, context.opportunity.cliente_id, "id,nome,email,telefone,status");
    const { data: tags, error } = await supabaseAdmin.from("crm_opportunity_tags").select("tag_id,crm_tags(id,nome,cor)").eq("clinica_id", event.clinica_id).eq("opportunity_id", event.subject.id);
    if (error) throw error;
    context.opportunity_tags = tags || [];
  } else if (event.subject.type === "booking" || event.subject.type === "agendamento") {
    context.booking = await tenantRow("agendamentos", event.clinica_id, event.subject.id);
    if (context.booking?.cliente_id) context.client = await tenantRow("clientes", event.clinica_id, context.booking.cliente_id, "id,nome,email,telefone,status");
  } else if (event.subject.type === "finance_receivable") {
    context.receivable = await tenantRow("finance_recebiveis", event.clinica_id, event.subject.id);
    if (context.receivable?.cliente_id) context.client = await tenantRow("clientes", event.clinica_id, context.receivable.cliente_id, "id,nome,email,telefone,status");
  }
  return context;
}

export async function assertTenantReference(table, clinicId, id) {
  const row = await tenantRow(table, clinicId, id, "id");
  if (!row) throw Object.assign(new Error("A referência não pertence à clínica ativa."), { code: "CROSS_TENANT_REFERENCE", permanent: true });
  return row;
}

export async function assertClinicOwnerReference(clinicId, ownerId) {
  if (!ownerId) throw Object.assign(new Error("Informe um responsável válido."), { code: "INVALID_OWNER_REFERENCE", permanent: true });
  const [{ data: member, error: memberError }, { data: professional, error: professionalError }] = await Promise.all([
    supabaseAdmin.from("usuarios_clinica").select("id,user_id").eq("clinica_id", clinicId).eq("user_id", ownerId).eq("ativo", true).maybeSingle(),
    supabaseAdmin.from("profissionais").select("id").eq("clinica_id", clinicId).eq("id", ownerId).eq("ativo", true).maybeSingle(),
  ]);
  if (memberError) throw memberError;
  if (professionalError) throw professionalError;
  if (!member && !professional) throw Object.assign(new Error("O responsável não pertence à clínica ativa."), { code: "CROSS_TENANT_REFERENCE", permanent: true });
  return member || professional;
}
