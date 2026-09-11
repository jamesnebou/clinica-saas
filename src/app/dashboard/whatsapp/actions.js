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
  let context = null;
  let connection = null;

  try {
    context = await managerContext();
    connection = await primaryConnection(context.activeClinic.id);

    const result = await syncConnectionTemplates(connection);

    await supabaseAdmin
      .from("whatsapp_connections")
      .update({ last_error: null })
      .eq("id", connection.id)
      .eq("clinica_id", context.activeClinic.id);

    try {
      await audit(
        context,
        "whatsapp.templates.synced",
        connection.id,
        result
      );
    } catch (auditError) {
      console.error("whatsapp_templates_sync_audit_failed", {
        connectionId: connection.id,
        message: sanitizeMetaError(auditError),
      });
    }

    revalidatePath("/dashboard/whatsapp");

    return {
      ok: true,
      action: "sync",
      total: Number(result?.total || 0),
      remoteTotal: Number(result?.remoteTotal || 0),
      message:
        Number(result?.total || 0) > 0
          ? `${Number(result.total)} template(s) sincronizado(s) com a Meta.`
          : "Sincronização concluída. Nenhum template NexaWi encontrado na Meta.",
    };
  } catch (error) {
    const sanitized = sanitizeMetaError(error);

    console.error("whatsapp_templates_sync_failed", {
      connectionId: connection?.id || null,
      status: error?.status ?? null,
      code: error?.code ?? null,
      subcode: error?.subcode ?? null,
      message: sanitized,
    });

    if (connection?.id && context?.activeClinic?.id) {
      try {
        await supabaseAdmin
          .from("whatsapp_connections")
          .update({ last_error: sanitized })
          .eq("id", connection.id)
          .eq("clinica_id", context.activeClinic.id);
      } catch (persistError) {
        console.error("whatsapp_templates_sync_error_persist_failed", {
          connectionId: connection.id,
          message: sanitizeMetaError(persistError),
        });
      }
    }

    return {
      ok: false,
      action: "sync",
      message:
        "Não foi possível sincronizar os templates com a Meta. A conexão do WhatsApp continua ativa.",
    };
  }
}

export async function submitWhatsAppTemplatesAction() {
  let context = null;
  let connection = null;

  try {
    context = await managerContext();
    connection = await primaryConnection(context.activeClinic.id);

    const provider = new MetaCloudProvider();

    // Primeiro traz o estado real da Meta para evitar duplicações.
    await syncConnectionTemplates(connection, provider);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("name,language")
      .eq("clinica_id", context.activeClinic.id)
      .eq("connection_id", connection.id);

    if (existingError) throw existingError;

    const existingKeys = new Set(
      (existing || []).map(
        (item) => `${item.name}:${item.language}`
      )
    );

    let submitted = 0;

    for (const purpose of Object.keys(TEMPLATE_CATALOG)) {
      const payload = buildTemplateSubmission(purpose);
      const key = `${payload.name}:${payload.language}`;

      if (existingKeys.has(key)) continue;

      await provider.client.createTemplate(
        connection.waba_id,
        payload
      );

      submitted += 1;
      existingKeys.add(key);
    }

    // Traz imediatamente da Meta tudo que foi criado.
    const syncResult = await syncConnectionTemplates(
      connection,
      provider
    );

    await supabaseAdmin
      .from("whatsapp_connections")
      .update({ last_error: null })
      .eq("id", connection.id)
      .eq("clinica_id", context.activeClinic.id);

    try {
      await audit(
        context,
        "whatsapp.templates.submitted",
        connection.id,
        {
          submitted,
          synced: Number(syncResult?.total || 0),
        }
      );
    } catch (auditError) {
      console.error("whatsapp_templates_submit_audit_failed", {
        connectionId: connection.id,
        message: sanitizeMetaError(auditError),
      });
    }

    revalidatePath("/dashboard/whatsapp");

    if (submitted === 0) {
      return {
        ok: true,
        action: "submit",
        submitted: 0,
        synced: Number(syncResult?.total || 0),
        message:
          "Nenhum template novo precisava ser enviado.",
      };
    }

    return {
      ok: true,
      action: "submit",
      submitted,
      synced: Number(syncResult?.total || 0),
      message: `${submitted} template(s) enviado(s) para análise da Meta.`,
    };
  } catch (error) {
    const sanitized = sanitizeMetaError(error);

    console.error("whatsapp_templates_submit_failed", {
      connectionId: connection?.id || null,
      status: error?.status ?? null,
      code: error?.code ?? null,
      subcode: error?.subcode ?? null,
      message: sanitized,
    });

    if (connection?.id && context?.activeClinic?.id) {
      try {
        await supabaseAdmin
          .from("whatsapp_connections")
          .update({ last_error: sanitized })
          .eq("id", connection.id)
          .eq("clinica_id", context.activeClinic.id);
      } catch (persistError) {
        console.error("whatsapp_templates_submit_error_persist_failed", {
          connectionId: connection.id,
          message: sanitizeMetaError(persistError),
        });
      }
    }

    /*
     * IMPORTANTE:
     * Não relançamos a exceção.
     * Assim um erro da Graph API não derruba a página inteira.
     *
     * Se alguns templates já foram criados antes do erro,
     * uma nova tentativa sincronizará a Meta primeiro e
     * continuará somente com os ausentes.
     */
    return {
      ok: false,
      action: "submit",
      submitted: 0,
      message:
        "Não foi possível enviar todos os templates. A conexão do WhatsApp continua ativa. Tente novamente.",
    };
  }
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
