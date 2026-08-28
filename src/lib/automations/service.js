import "server-only";
import { createClient } from "@/lib/supabase/server";

function missing(error) { return ["42P01", "PGRST205", "PGRST204"].includes(error?.code); }

export async function getAutomationDashboard(clinicId) {
  const supabase = await createClient();
  const [automations, runs, tasks] = await Promise.all([
    supabase.from("automations").select("id,name,description,status,trigger_type,current_version_id,published_at,updated_at").eq("clinica_id", clinicId).order("updated_at", { ascending: false }),
    supabase.from("automation_runs").select("id,automation_id,source_event_type,status,started_at,completed_at,created_at,failure_code").eq("clinica_id", clinicId).order("created_at", { ascending: false }).limit(50),
    supabase.from("automation_tasks").select("id,title,status,due_at,created_at").eq("clinica_id", clinicId).eq("status", "pending").order("due_at", { ascending: true }).limit(10),
  ]);
  const error = [automations.error, runs.error, tasks.error].find(Boolean);
  if (error && missing(error)) return { available: false, automations: [], runs: [], tasks: [], metrics: {} };
  if (error) throw error;
  const list = automations.data || [];
  const runList = runs.data || [];
  return { available: true, automations: list, runs: runList, tasks: tasks.data || [], metrics: { active: list.filter((item) => item.status === "active").length, waiting: runList.filter((item) => item.status === "waiting").length, completed: runList.filter((item) => item.status === "completed").length, failed: runList.filter((item) => item.status === "failed").length } };
}

export async function getAutomationDetail(clinicId, automationId) {
  const supabase = await createClient();
  const { data: automation, error } = await supabase.from("automations").select("*").eq("clinica_id", clinicId).eq("id", automationId).single();
  if (error) throw error;
  const [{ data: versions, error: versionsError }, { data: runs, error: runsError }] = await Promise.all([
    supabase.from("automation_versions").select("id,version,status,trigger_type,created_at,created_by").eq("clinica_id", clinicId).eq("automation_id", automationId).order("version", { ascending: false }),
    supabase.from("automation_runs").select("id,status,source_event_type,entity_type,entity_id,started_at,completed_at,created_at,failure_code,failure_message,automation_run_steps(step_id,step_type,action_type,status,result,error_code,error_message,started_at,completed_at)").eq("clinica_id", clinicId).eq("automation_id", automationId).order("created_at", { ascending: false }).limit(25),
  ]);
  if (versionsError || runsError) throw versionsError || runsError;
  return { automation, versions: versions || [], runs: runs || [] };
}
