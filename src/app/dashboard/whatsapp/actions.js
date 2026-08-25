"use server";
import { revalidatePath } from "next/cache";
import { requireClinicSection } from "@/lib/auth/session";
import { getCurrentMembership } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MetaCloudProvider } from "@/lib/whatsapp/meta/provider";
import { syncConnectionTemplates } from "@/lib/whatsapp/onboarding";
import { sanitizeMetaError } from "@/lib/whatsapp/meta/errors";
import { TEMPLATE_CATALOG, buildTemplateSubmission } from "@/lib/whatsapp/meta/templates";

function checked(formData, key) { return formData.get(key) === "on"; }
function integer(formData, key, min, max) { const value = Number(formData.get(key)); if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Valor inválido em ${key}.`); return value; }
async function managerContext() {
  const context = await requireClinicSection("whatsapp"); const membership = getCurrentMembership(context.memberships, context.activeClinic.id);
  if (!["owner","admin"].includes(membership?.papel)) throw new Error("Somente owner ou admin pode gerenciar o WhatsApp.");
  return context;
}
async function primaryConnection(clinicId) {
  const { data, error } = await supabaseAdmin.from("whatsapp_connections").select("*").eq("clinica_id", clinicId).eq("is_primary", true).maybeSingle(); if (error) throw error; if (!data) throw new Error("Conecte o WhatsApp antes de executar esta ação."); return data;
}
async function audit(context, action, entityId, metadata = {}) {
  await supabaseAdmin.from("auditoria_clinica").insert({ clinica_id: context.activeClinic.id, actor_id: context.user.id, acao: action, entidade_tipo: "whatsapp_connection", entidade_id: entityId, metadata });
}

export async function updateWhatsAppAutomationsAction(formData) {
  const context = await managerContext(); const clinicId = context.activeClinic.id;
  const payload = {
    clinica_id: clinicId, enabled: checked(formData,"enabled"), privacy_mode: String(formData.get("privacy_mode") || "discreto") === "detalhado" ? "detalhado" : "discreto",
    booking_created_enabled: checked(formData,"booking_created_enabled"), payment_pending_enabled: checked(formData,"payment_pending_enabled"), payment_confirmed_enabled: checked(formData,"payment_confirmed_enabled"),
    payment_expiring_enabled: checked(formData,"payment_expiring_enabled"), payment_expired_enabled: checked(formData,"payment_expired_enabled"), reminder_24h_enabled: checked(formData,"reminder_24h_enabled"), reminder_3h_enabled: checked(formData,"reminder_3h_enabled"),
    booking_cancelled_enabled: checked(formData,"booking_cancelled_enabled"), booking_rescheduled_enabled: checked(formData,"booking_rescheduled_enabled"),
    payment_expiring_minutes: integer(formData,"payment_expiring_minutes",5,10080), payment_expiration_minutes: integer(formData,"payment_expiration_minutes",15,43200), reminder_24h_minutes: integer(formData,"reminder_24h_minutes",60,10080), reminder_3h_minutes: integer(formData,"reminder_3h_minutes",15,1440),
  };
  const { error } = await supabaseAdmin.from("whatsapp_automation_settings").upsert(payload, { onConflict: "clinica_id" }); if (error) throw error;
  await audit(context, "whatsapp.automations.updated", clinicId, { enabled: payload.enabled, privacy_mode: payload.privacy_mode }); revalidatePath("/dashboard/whatsapp");
}

export async function syncWhatsAppTemplatesAction() {
  const context = await managerContext(); const connection = await primaryConnection(context.activeClinic.id);
  await supabaseAdmin.from("whatsapp_connections").update({ onboarding_status: "templates_syncing" }).eq("id", connection.id);
  try { const result = await syncConnectionTemplates(connection); await supabaseAdmin.from("whatsapp_connections").update({ onboarding_status: "ready", last_error: null }).eq("id", connection.id); await audit(context,"whatsapp.templates.synced",connection.id,result); }
  catch (error) { await supabaseAdmin.from("whatsapp_connections").update({ onboarding_status: "error", last_error: sanitizeMetaError(error) }).eq("id", connection.id); throw error; }
  revalidatePath("/dashboard/whatsapp");
}

export async function submitWhatsAppTemplatesAction() {
  const context = await managerContext();
  const connection = await primaryConnection(context.activeClinic.id);
  const provider = new MetaCloudProvider();
  await syncConnectionTemplates(connection, provider);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("name,language")
    .eq("connection_id", connection.id);
  if (existingError) throw existingError;
  const existingKeys = new Set((existing || []).map((item) => `${item.name}:${item.language}`));
  let submitted = 0;
  try {
    for (const purpose of Object.keys(TEMPLATE_CATALOG)) {
      const payload = buildTemplateSubmission(purpose);
      if (existingKeys.has(`${payload.name}:${payload.language}`)) continue;
      await provider.client.createTemplate(connection.waba_id, payload);
      submitted += 1;
    }
    await syncConnectionTemplates(connection);
    await audit(context, "whatsapp.templates.submitted", connection.id, { submitted });
  } catch (error) {
    await supabaseAdmin.from("whatsapp_connections").update({ last_error: sanitizeMetaError(error) }).eq("id", connection.id);
    throw error;
  }
  revalidatePath("/dashboard/whatsapp");
}

export async function checkWhatsAppHealthAction() {
  const context = await managerContext(); const connection = await primaryConnection(context.activeClinic.id); const provider = new MetaCloudProvider();
  try {
    const health = await provider.healthCheck(connection); const ready = health.webhookActive && health.phone?.id;
    await supabaseAdmin.from("whatsapp_connections").update({ connection_status: ready ? "connected" : "degraded", quality_rating: health.phone?.quality_rating || null, messaging_limit: health.phone?.throughput?.level || null, last_health_check_at: new Date().toISOString(), last_error: ready ? null : "Webhook ou número ainda não está ativo na Meta." }).eq("id", connection.id);
    await audit(context,"whatsapp.health.checked",connection.id,{ ready: Boolean(ready), webhook_active: health.webhookActive });
  } catch (error) { await supabaseAdmin.from("whatsapp_connections").update({ connection_status: "degraded", last_health_check_at: new Date().toISOString(), last_error: sanitizeMetaError(error) }).eq("id", connection.id); throw error; }
  revalidatePath("/dashboard/whatsapp");
}

export async function disconnectWhatsAppAction() {
  const context = await managerContext(); const connection = await primaryConnection(context.activeClinic.id); const provider = new MetaCloudProvider();
  await provider.client.unsubscribeApp(connection.waba_id);
  await Promise.all([
    supabaseAdmin.from("whatsapp_connections").update({ connection_status: "disconnected", onboarding_status: "not_started", disconnected_at: new Date().toISOString(), is_primary: false }).eq("id", connection.id),
    supabaseAdmin.from("whatsapp_automation_settings").update({ enabled: false, connection_id: null }).eq("clinica_id", context.activeClinic.id),
    audit(context,"whatsapp.connection.disconnected",connection.id),
  ]);
  revalidatePath("/dashboard/whatsapp");
}
