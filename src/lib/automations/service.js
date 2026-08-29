import "server-only";
import { createClient } from "@/lib/supabase/server";

function missing(error) { return ["42P01", "PGRST205", "PGRST204"].includes(error?.code); }

function schemaIssue(resource, error) {
  return {
    resource,
    code: error?.code || "SCHEMA_UNAVAILABLE",
    message: error?.message || "O schema do Motor de Automação 2.0 ainda não está disponível.",
  };
}

export async function getAutomationDashboard(clinicId) {
  const supabase = await createClient();
  const [automations, runs, tasks, health] = await Promise.all([
    supabase.from("automations").select("id,name,description,status,trigger_type,current_version_id,published_at,updated_at").eq("clinica_id", clinicId).order("updated_at", { ascending: false }),
    supabase.from("automation_runs").select("id,automation_id,source_event_type,status,started_at,completed_at,created_at,failure_code").eq("clinica_id", clinicId).order("created_at", { ascending: false }).limit(50),
    supabase.from("automation_tasks").select("id,title,status,due_at,created_at").eq("clinica_id", clinicId).eq("status", "pending").order("due_at", { ascending: true }).limit(10),
    supabase.rpc("get_automation_worker_health"),
  ]);
  const failedQuery = [
    { resource: "automations", error: automations.error },
    { resource: "automation_runs", error: runs.error },
    { resource: "automation_tasks", error: tasks.error },
  ].find((query) => query.error);
  const error = failedQuery?.error;
  if (error && missing(error)) {
    return {
      available: false,
      automations: [],
      runs: [],
      tasks: [],
      metrics: {},
      workerHealth: { available: false, status: "schema_unavailable" },
      schemaIssue: schemaIssue(failedQuery.resource, error),
    };
  }
  if (error) throw error;
  const list = automations.data || [];
  const runList = runs.data || [];
  const runIds = runList.map((run) => run.id);
  const steps = runIds.length
    ? await supabase.from("automation_run_steps").select("run_id,step_type,status").eq("clinica_id", clinicId).in("run_id", runIds)
    : { data: [], error: null };
  if (steps.error && !missing(steps.error)) throw steps.error;
  const actionCounts = new Map();
  for (const step of steps.data || []) {
    if (step.step_type !== "action") continue;
    actionCounts.set(step.run_id, Number(actionCounts.get(step.run_id) || 0) + 1);
  }
  const stats = new Map(list.map((item) => [item.id, { runs: 0, completed: 0, failed: 0, actions: 0, lastRun: null }]));
  for (const run of runList) {
    const item = stats.get(run.automation_id);
    if (!item) continue;
    item.runs += 1;
    item.completed += run.status === "completed" ? 1 : 0;
    item.failed += run.status === "failed" ? 1 : 0;
    item.actions += Number(actionCounts.get(run.id) || 0);
    if (!item.lastRun) item.lastRun = run;
  }
  const enriched = list.map((item) => {
    const itemStats = stats.get(item.id);
    const finished = itemStats.completed + itemStats.failed;
    return { ...item, recent_stats: { ...itemStats, successRate: finished ? Math.round((itemStats.completed / finished) * 100) : null } };
  });
  const healthData = health.data || { status: "never_run" };
  const healthReference = Date.parse(healthData.completed_at || healthData.started_at || "");
  const workerHealth = health.error
    ? { available: false, status: "health_unavailable", code: health.error.code || null }
    : { available: true, ...healthData, stale: Number.isFinite(healthReference) && Date.now() - healthReference > 15 * 60_000 };
  return { available: true, automations: enriched, runs: runList, tasks: tasks.data || [], workerHealth, metrics: { active: list.filter((item) => item.status === "active").length, waiting: runList.filter((item) => item.status === "waiting").length, completed: runList.filter((item) => item.status === "completed").length, failed: runList.filter((item) => item.status === "failed").length, actions: [...actionCounts.values()].reduce((total, value) => total + value, 0) } };
}

export async function getAutomationDetail(clinicId, automationId, filters = {}) {
  const supabase = await createClient();
  const pageSize = 20;
  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const { data: automation, error } = await supabase.from("automations").select("*").eq("clinica_id", clinicId).eq("id", automationId).single();
  if (error) throw error;
  let runsQuery = supabase.from("automation_runs")
    .select("id,status,source_event_type,entity_type,entity_id,started_at,completed_at,created_at,failure_code,failure_message,automation_run_steps(step_id,step_type,action_type,status,result,error_code,error_message,started_at,completed_at)", { count: "exact" })
    .eq("clinica_id", clinicId)
    .eq("automation_id", automationId);
  if (filters.status) runsQuery = runsQuery.eq("status", filters.status);
  if (filters.trigger) runsQuery = runsQuery.eq("source_event_type", filters.trigger);
  if (filters.entity) runsQuery = runsQuery.eq("entity_type", filters.entity);
  if (filters.from) runsQuery = runsQuery.gte("created_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to) runsQuery = runsQuery.lte("created_at", `${filters.to}T23:59:59.999Z`);
  runsQuery = runsQuery.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  const [{ data: versions, error: versionsError }, { data: runs, error: runsError, count }] = await Promise.all([
    supabase.from("automation_versions").select("id,version,status,trigger_type,created_at,created_by").eq("clinica_id", clinicId).eq("automation_id", automationId).order("version", { ascending: false }),
    runsQuery,
  ]);
  if (versionsError || runsError) throw versionsError || runsError;
  return {
    automation,
    versions: versions || [],
    runs: runs || [],
    pagination: { page, pageSize, total: Number(count || 0), pages: Math.max(1, Math.ceil(Number(count || 0) / pageSize)) },
  };
}
