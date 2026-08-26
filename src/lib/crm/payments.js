import { supabaseAdmin } from "@/lib/supabase/admin";

const OPTIONAL_SCHEMA_CODES = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]);

function isOptionalSchemaError(error) {
  return Boolean(error && OPTIONAL_SCHEMA_CODES.has(error.code));
}

export async function closeDirectSaleOpportunityFromBooking(booking) {
  if (!booking?.clinica_id || !booking?.crm_oportunidade_id || !booking?.procedimento_id) return false;

  const { data: procedure, error: procedureError } = await supabaseAdmin
    .from("procedimentos")
    .select("crm_booking_behavior")
    .eq("id", booking.procedimento_id)
    .eq("clinica_id", booking.clinica_id)
    .maybeSingle();

  if (isOptionalSchemaError(procedureError)) return false;
  if (procedureError) throw procedureError;
  if (procedure?.crm_booking_behavior !== "direct_sale") return false;

  const { data: opportunity, error: opportunityError } = await supabaseAdmin
    .from("crm_oportunidades")
    .select("id,pipeline_id,stage_id,won_at")
    .eq("id", booking.crm_oportunidade_id)
    .eq("clinica_id", booking.clinica_id)
    .maybeSingle();

  if (isOptionalSchemaError(opportunityError)) return false;
  if (opportunityError) throw opportunityError;
  if (!opportunity?.id || opportunity.won_at) return false;

  const { data: wonStage, error: stageError } = await supabaseAdmin
    .from("crm_pipeline_stages")
    .select("id")
    .eq("clinica_id", booking.clinica_id)
    .eq("pipeline_id", opportunity.pipeline_id)
    .eq("tipo", "won")
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (isOptionalSchemaError(stageError)) return false;
  if (stageError) throw stageError;
  if (!wonStage?.id) return false;

  const { error: moveError } = await supabaseAdmin.rpc("crm_move_opportunity", {
    p_clinica_id: booking.clinica_id,
    p_opportunity_id: opportunity.id,
    p_stage_id: wonStage.id,
    p_lost_reason_id: null,
    p_closed_value: Number(booking.valor_total || booking.valor_sinal || 0),
  });

  if (isOptionalSchemaError(moveError)) return false;
  if (moveError) throw moveError;
  return true;
}
