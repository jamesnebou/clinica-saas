import { createClient } from "@/lib/supabase/server";
import { calculateCrmMetrics } from "@/lib/crm/core.mjs";

const MISSING_CODES = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]);

export function isCrm2SchemaMissing(error) {
  return Boolean(error && (MISSING_CODES.has(error.code) || /crm_pipeline|crm_activities|schema cache/i.test(error.message || "")));
}

export async function getCrmWorkspace(clinicId, filters = {}) {
  const supabase = await createClient();
  const ensured = await supabase.rpc("crm_ensure_default_pipeline", { p_clinica_id: clinicId });
  if (isCrm2SchemaMissing(ensured.error)) return { available: false };
  // Instalações anteriores podiam conflitar por semantic_key ao garantir etapas já existentes.
  // O pipeline continua válido; recupere-o abaixo enquanto o fix-forward é aplicado no banco.
  if (ensured.error && ensured.error.code !== "23505") throw ensured.error;
  const pipelineResult = await supabase.from("crm_pipelines").select("id,nome,padrao,ativo,ordem").eq("clinica_id", clinicId).eq("ativo", true).order("ordem");
  if (pipelineResult.error) throw pipelineResult.error;
  const pipelines = pipelineResult.data || [];
  const selectedPipelineId = pipelines.some((pipeline) => pipeline.id === filters.pipelineId)
    ? filters.pipelineId
    : ensured.data || pipelines.find((pipeline) => pipeline.padrao)?.id || pipelines[0]?.id;
  if (!selectedPipelineId) throw ensured.error || new Error("Nenhum pipeline ativo foi encontrado para esta clínica.");
  let opportunityQuery = supabase.from("crm_oportunidades")
    .select("id,clinica_id,cliente_id,nome,titulo,telefone,email,origem,status,valor_estimado,valor_fechado,pipeline_id,stage_id,procedimento_id,responsavel_id,temperatura,score,sort_order,observacoes,source,medium,campaign,content,term,referrer,landing_page,created_at,updated_at,won_at,lost_at,lost_reason_id,next_activity_at,first_response_at,last_activity_at")
    .eq("clinica_id", clinicId).eq("pipeline_id", selectedPipelineId).order("sort_order", { ascending: true });
  if (filters.ownerId) opportunityQuery = opportunityQuery.eq("responsavel_id", filters.ownerId);
  if (filters.temperature) opportunityQuery = opportunityQuery.eq("temperatura", filters.temperature);
  if (filters.origin) opportunityQuery = opportunityQuery.eq("origem", filters.origin);

  const results = await Promise.all([
    supabase.from("crm_pipeline_stages").select("id,pipeline_id,nome,slug,ordem,cor,probabilidade,tipo,semantic_key,ativo").eq("clinica_id", clinicId).eq("pipeline_id", selectedPipelineId).eq("ativo", true).order("ordem"),
    opportunityQuery,
    supabase.from("crm_activities").select("id,opportunity_id,owner_id,tipo,titulo,descricao,due_at,completed_at,status,created_at").eq("clinica_id", clinicId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("crm_opportunity_events").select("id,opportunity_id,event_type,data,occurred_at,actor_id").eq("clinica_id", clinicId).order("occurred_at", { ascending: false }).limit(1500),
    supabase.from("crm_tags").select("id,nome,cor,ativo").eq("clinica_id", clinicId).eq("ativo", true).order("nome"),
    supabase.from("crm_opportunity_tags").select("opportunity_id,tag_id").eq("clinica_id", clinicId).limit(5000),
    supabase.from("crm_lost_reasons").select("id,nome,ativo,ordem").eq("clinica_id", clinicId).eq("ativo", true).order("ordem"),
    supabase.from("usuarios_clinica").select("id,user_id,nome,email,papel,ativo").eq("clinica_id", clinicId).eq("ativo", true).order("nome"),
    supabase.from("procedimentos").select("id,nome,crm_booking_behavior").eq("clinica_id", clinicId).eq("ativo", true).order("nome"),
    supabase.from("crm_opportunity_appointments").select("opportunity_id,agendamento_id,agendamentos(id,inicio,fim,status,valor,pagamento_status)").eq("clinica_id", clinicId).limit(1000),
  ]);
  const firstError = results.map((item) => item.error).find(Boolean);
  if (isCrm2SchemaMissing(firstError)) return { available: false };
  if (firstError) throw firstError;
  const [stages, opportunities, activities, events, tags, opportunityTags, reasons, members, procedures, appointments] = results.map((item) => item.data || []);
  const rpcMetrics = await supabase.rpc("crm_pipeline_metrics", { p_clinica_id: clinicId, p_pipeline_id: selectedPipelineId });
  const metrics = rpcMetrics.error ? calculateCrmMetrics(opportunities, stages, activities) : {
    openCount: Number(rpcMetrics.data?.open_count || 0), pipelineValue: Number(rpcMetrics.data?.pipeline_value || 0),
    weightedValue: Number(rpcMetrics.data?.weighted_value || 0), wonCount: Number(rpcMetrics.data?.won_count || 0),
    lostCount: Number(rpcMetrics.data?.lost_count || 0), conversionRate: Number(rpcMetrics.data?.conversion_rate || 0),
    averageTicket: Number(rpcMetrics.data?.average_ticket || 0), overdueActivities: Number(rpcMetrics.data?.overdue_activities || 0),
    withoutNextActivity: Number(rpcMetrics.data?.without_next_activity || 0),
  };
  return { available: true, selectedPipelineId, pipelines, stages, opportunities, activities, events, tags, opportunityTags, lostReasons: reasons, members, procedures, appointments, metrics };
}
