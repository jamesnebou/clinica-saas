import { NextResponse } from "next/server";
import { getUserClinics } from "@/lib/auth/session";
import { canAccessSection, getCurrentMembership } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

function csvCell(value) {
  const content = String(value ?? "");
  return /[;"\r\n]/.test(content) ? `"${content.replaceAll('"', '""')}"` : content;
}

export async function GET(request) {
  const context = await getUserClinics();
  if (!context.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!context.activeClinic) return NextResponse.json({ error: "Clínica não encontrada." }, { status: 404 });
  const membership = getCurrentMembership(context.memberships, context.activeClinic.id);
  if (!canAccessSection(membership?.papel, "crm", membership)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const pipelineId = String(searchParams.get("pipeline") || "");
  const ownerId = String(searchParams.get("responsavel") || "");
  const temperature = String(searchParams.get("temperatura") || "");
  const origin = String(searchParams.get("origem") || "");
  const supabase = await createClient();
  let query = supabase.from("crm_oportunidades")
    .select("id,nome,titulo,telefone,email,origem,status,valor_estimado,valor_fechado,temperatura,score,responsavel_id,source,medium,campaign,created_at,last_activity_at,next_activity_at,won_at,lost_at,pipeline_id,stage_id")
    .eq("clinica_id", context.activeClinic.id)
    .order("created_at", { ascending: false })
    .limit(10000);
  if (pipelineId) query = query.eq("pipeline_id", pipelineId);
  if (ownerId) query = query.eq("responsavel_id", ownerId);
  if (temperature) query = query.eq("temperatura", temperature);
  if (origin) query = query.eq("origem", origin);
  const [opportunitiesResult, pipelinesResult, stagesResult, membersResult] = await Promise.all([
    query,
    supabase.from("crm_pipelines").select("id,nome").eq("clinica_id", context.activeClinic.id),
    supabase.from("crm_pipeline_stages").select("id,nome").eq("clinica_id", context.activeClinic.id),
    supabase.from("usuarios_clinica").select("user_id,nome,email").eq("clinica_id", context.activeClinic.id),
  ]);
  const error = [opportunitiesResult.error, pipelinesResult.error, stagesResult.error, membersResult.error].find(Boolean);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pipelines = new Map((pipelinesResult.data || []).map((item) => [item.id, item.nome]));
  const stages = new Map((stagesResult.data || []).map((item) => [item.id, item.nome]));
  const members = new Map((membersResult.data || []).map((item) => [item.user_id, item.nome || item.email]));
  const columns = ["contato","telefone","email","oportunidade","pipeline","etapa","responsavel","origem","source","medium","campaign","valor_estimado","valor_fechado","temperatura","score","criada_em","ultima_atividade","proxima_atividade","ganha_em","perdida_em"];
  const rows = (opportunitiesResult.data || []).map((item) => [
    item.nome,item.telefone,item.email,item.titulo,pipelines.get(item.pipeline_id),stages.get(item.stage_id),members.get(item.responsavel_id),
    item.origem,item.source,item.medium,item.campaign,item.valor_estimado,item.valor_fechado,item.temperatura,item.score,item.created_at,
    item.last_activity_at,item.next_activity_at,item.won_at,item.lost_at,
  ]);
  const csvRows = [["NexaWi Clínicas - CRM 2.0"],["Clínica",context.activeClinic.nome],["Exportado em",new Date().toISOString()],[],columns,...rows];

  const { error: auditError } = await supabase.from("auditoria_clinica").insert({
    clinica_id: context.activeClinic.id,
    actor_id: context.user.id,
    acao: "crm.exportacao_csv",
    entidade_tipo: "crm_oportunidades",
    metadata: { pipeline_id: pipelineId || null, responsavel_id: ownerId || null, temperatura: temperature || null, origem: origin || null, quantidade: rows.length },
  });
  if (auditError) console.error("Erro ao auditar exportação do CRM:", auditError.message);

  const csv = `\uFEFF${csvRows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="crm-${new Date().toISOString().slice(0,10)}.csv"`, "Cache-Control": "private, no-store" } });
}
