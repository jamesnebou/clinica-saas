import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clinicTimeZone } from "@/lib/clinic/schedule";
import { AUTOMATION_FLAG_BY_PURPOSE, PURPOSE_BY_EVENT, deterministicInteractionToken, hashOpaqueToken, nextRetryAt, normalizeWhatsAppPhone } from "./core.mjs";
import { MetaCloudProvider } from "./meta/provider";
import { sanitizeMetaError } from "./meta/errors";

const PURPOSE_LABELS = Object.freeze({
  booking_created: "Novo agendamento", booking_payment_pending: "Pagamento pendente",
  payment_confirmed: "Pagamento confirmado", payment_expiring: "Pagamento perto do vencimento",
  payment_expired: "Pagamento expirado", appointment_reminder_24h: "Lembrete 24 horas",
  appointment_reminder_3h: "Lembrete 3 horas", booking_cancelled: "Cancelamento",
  booking_rescheduled: "Remarcação",
});

function safeError(error) { return String(error?.message || error || "Erro desconhecido").slice(0, 500); }
function money(value) { return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function dateTime(value, timeZone) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date),
  };
}

async function analytics(clinicId, eventName, metadata = {}) {
  const { error } = await supabaseAdmin.from("eventos_analiticos").insert({ clinica_id: clinicId, event_name: eventName, metadata });
  if (error && !["42P01", "PGRST205"].includes(error.code)) console.error("whatsapp_analytics_failed", { clinicId, eventName, code: error.code });
}

async function bookingContext(event) {
  const { data: booking, error } = await supabaseAdmin.from("agendamentos")
    .select("id,clinica_id,cliente_id,inicio,fim,status,valor,pagamento_status,clientes(id,nome,telefone),clinicas(id,nome,metadata)")
    .eq("id", event.aggregate_id).eq("clinica_id", event.clinica_id).maybeSingle();
  if (error) throw error;
  if (!booking) throw new Error("Agendamento do evento não encontrado.");
  const { data: publicBooking } = await supabaseAdmin.from("site_agendamentos_publicos")
    .select("id,valor_sinal,pagamento_status,invoice_url,created_at")
    .eq("agendamento_id", booking.id).eq("clinica_id", event.clinica_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { booking, publicBooking };
}

async function cancelPendingBookingJobs(event, purposes = null) {
  const { data: events, error } = await supabaseAdmin.from("domain_outbox_events").select("id").eq("clinica_id", event.clinica_id).eq("aggregate_id", event.aggregate_id);
  if (error) throw error;
  const ids = (events || []).map((item) => item.id);
  if (!ids.length) return;
  let query = supabaseAdmin.from("notification_jobs").update({ status: "cancelled", cancelled_at: new Date().toISOString(), locked_at: null, locked_by: null }).eq("clinica_id", event.clinica_id).in("event_id", ids).in("status", ["pending","retry"]);
  if (purposes?.length) query = query.in("template_purpose", purposes);
  const { error: cancelError } = await query;
  if (cancelError) throw cancelError;
}

function scheduledJobs({ event, booking, publicBooking, settings, recipient }) {
  const purpose = PURPOSE_BY_EVENT[event.event_name];
  const jobs = [];
  if (purpose) jobs.push({ purpose, scheduledAt: new Date().toISOString() });
  if (["booking.created", "booking.rescheduled"].includes(event.event_name)) {
    const start = new Date(booking.inicio).getTime();
    if (settings.reminder_24h_enabled) jobs.push({ purpose: "appointment_reminder_24h", scheduledAt: new Date(start - settings.reminder_24h_minutes * 60000).toISOString() });
    if (settings.reminder_3h_enabled) jobs.push({ purpose: "appointment_reminder_3h", scheduledAt: new Date(start - settings.reminder_3h_minutes * 60000).toISOString() });
    if (event.event_name === "booking.created" && publicBooking?.pagamento_status === "pendente") {
      const created = new Date(publicBooking.created_at).getTime();
      if (settings.payment_expiring_enabled) jobs.push({ purpose: "payment_expiring", scheduledAt: new Date(created + Math.max(0, settings.payment_expiration_minutes - settings.payment_expiring_minutes) * 60000).toISOString() });
      if (settings.payment_expired_enabled) jobs.push({ purpose: "payment_expired", scheduledAt: new Date(created + settings.payment_expiration_minutes * 60000).toISOString() });
    }
  }
  return jobs.filter((item) => new Date(item.scheduledAt).getTime() > Date.now() - 60_000 && settings[AUTOMATION_FLAG_BY_PURPOSE[item.purpose]] !== false)
    .map((item) => ({ clinica_id: event.clinica_id, event_id: event.id, channel: "whatsapp", recipient, template_purpose: item.purpose, scheduled_at: item.scheduledAt }));
}

export async function processOutboxEvent(event) {
  try {
    if (event.event_name === "booking.cancelled") await cancelPendingBookingJobs(event);
    if (event.event_name === "booking.rescheduled") {
      await cancelPendingBookingJobs(event, ["appointment_reminder_24h", "appointment_reminder_3h", "booking_rescheduled"]);
    }
    if (event.event_name === "payment.confirmed") {
      await cancelPendingBookingJobs(event, ["booking_payment_pending", "payment_expiring", "payment_expired"]);
    }
    const [{ booking, publicBooking }, settingsResult, connectionResult] = await Promise.all([
      bookingContext(event),
      supabaseAdmin.from("whatsapp_automation_settings").select("*").eq("clinica_id", event.clinica_id).maybeSingle(),
      supabaseAdmin.from("whatsapp_connections").select("id,onboarding_status,connection_status").eq("clinica_id", event.clinica_id).eq("is_primary", true).maybeSingle(),
    ]);
    const settings = settingsResult.data;
    const connection = connectionResult.data;
    const recipient = normalizeWhatsAppPhone(booking.clientes?.telefone);
    if (!settings?.enabled || !connection || connection.onboarding_status !== "ready" || connection.connection_status !== "connected" || !recipient) {
      await supabaseAdmin.from("domain_outbox_events").update({ status: "processed", processed_at: new Date().toISOString(), locked_at: null, locked_by: null }).eq("id", event.id);
      return { skipped: true };
    }
    const jobs = scheduledJobs({ event, booking, publicBooking, settings, recipient });
    if (jobs.length) {
      const { error } = await supabaseAdmin.from("notification_jobs").upsert(jobs, { onConflict: "event_id,channel,recipient,template_purpose,scheduled_at", ignoreDuplicates: true });
      if (error) throw error;
      await analytics(event.clinica_id, "whatsapp_queued", { event_id: event.id, aggregate_id: event.aggregate_id, jobs: jobs.length });
    }
    await supabaseAdmin.from("domain_outbox_events").update({ status: "processed", processed_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: null }).eq("id", event.id);
    return { jobs: jobs.length };
  } catch (error) {
    const permanent = Number(event.attempts || 0) >= 5;
    await supabaseAdmin.from("domain_outbox_events").update({ status: permanent ? "failed" : "retry", available_at: nextRetryAt(event.attempts), locked_at: null, locked_by: null, last_error: safeError(error) }).eq("id", event.id);
    throw error;
  }
}

async function sendContext(job) {
  const { data: event, error: eventError } = await supabaseAdmin.from("domain_outbox_events").select("*").eq("id", job.event_id).eq("clinica_id", job.clinica_id).single();
  if (eventError) throw eventError;
  const [{ booking, publicBooking }, connectionResult, templateResult, preferenceResult, settingsResult] = await Promise.all([
    bookingContext(event),
    supabaseAdmin.from("whatsapp_connections").select("*").eq("clinica_id", job.clinica_id).eq("is_primary", true).eq("connection_status", "connected").eq("onboarding_status", "ready").maybeSingle(),
    supabaseAdmin.from("whatsapp_templates").select("*").eq("clinica_id", job.clinica_id).eq("purpose", job.template_purpose).eq("status", "APPROVED").maybeSingle(),
    supabaseAdmin.from("communication_preferences").select("whatsapp_transactional_opt_in,opt_out_at").eq("clinica_id", job.clinica_id).eq("phone_normalized", job.recipient).maybeSingle(),
    supabaseAdmin.from("whatsapp_automation_settings").select("payment_expiration_minutes").eq("clinica_id", job.clinica_id).maybeSingle(),
  ]);
  return { event, booking, publicBooking, connection: connectionResult.data, template: templateResult.data, preference: preferenceResult.data, settings: settingsResult.data };
}

function templateVariables({ job, booking, publicBooking, settings }) {
  const zone = clinicTimeZone(booking.clinicas); const when = dateTime(booking.inicio, zone);
  const name = booking.clientes?.nome || "Cliente"; const clinic = booking.clinicas?.nome || "Clínica";
  const value = money(publicBooking?.valor_sinal || 0);
  const expirationMinutes = Number(settings?.payment_expiration_minutes || 1440);
  const deadline = publicBooking?.created_at ? dateTime(new Date(new Date(publicBooking.created_at).getTime() + expirationMinutes * 60000), zone) : when;
  const common = [name, clinic, when.date, when.time];
  if (["booking_payment_pending","payment_expiring"].includes(job.template_purpose)) return [...common, value, `${deadline.date} às ${deadline.time}`];
  return common;
}

async function confirmationInteraction(job, booking) {
  if (!["appointment_reminder_24h","appointment_reminder_3h"].includes(job.template_purpose)) return null;
  const secret = process.env.META_INTERACTION_TOKEN_SECRET || process.env.CLINICA_SECRETS_KEY;
  if (!secret) throw Object.assign(new Error("Segredo de interação do WhatsApp não configurado."), { permanent: true });
  const token = deterministicInteractionToken(job.id, secret);
  const expiresAt = new Date(Math.max(new Date(booking.inicio).getTime() + 24 * 3600000, Date.now() + 3600000)).toISOString();
  const { error } = await supabaseAdmin.from("whatsapp_interaction_tokens").upsert({
    clinica_id: job.clinica_id,
    agendamento_id: booking.id,
    action: "confirm",
    token_hash: hashOpaqueToken(token),
    expires_at: expiresAt,
  }, { onConflict: "token_hash", ignoreDuplicates: true });
  if (error) throw error;
  return `nxw:confirm:${token}`;
}

async function trackedPaymentLink(job, booking, publicBooking) {
  if (!["booking_payment_pending","payment_expiring"].includes(job.template_purpose) || !publicBooking?.invoice_url) return null;
  const secret = process.env.META_INTERACTION_TOKEN_SECRET || process.env.CLINICA_SECRETS_KEY;
  const origin = String(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!secret || !origin) throw Object.assign(new Error("Segredo de interação ou APP_URL não configurado."), { permanent: true });
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) {
    throw Object.assign(new Error("APP_URL precisa usar HTTPS em produção."), { permanent: true });
  }
  const token = deterministicInteractionToken(job.id, secret);
  const expiresAt = new Date(Math.max(new Date(booking.inicio).getTime(), Date.now() + 3600000)).toISOString();
  const { error } = await supabaseAdmin.from("whatsapp_interaction_tokens").upsert({
    clinica_id: job.clinica_id,
    agendamento_id: booking.id,
    action: "payment",
    token_hash: hashOpaqueToken(token),
    expires_at: expiresAt,
  }, { onConflict: "token_hash", ignoreDuplicates: true });
  if (error) throw error;
  return `${origin}/api/whatsapp/payment/${encodeURIComponent(token)}`;
}

export async function processNotificationJob(job, { provider = new MetaCloudProvider() } = {}) {
  try {
    const context = await sendContext(job);
    if (!context.connection) throw Object.assign(new Error("Conexão WhatsApp indisponível."), { permanent: true });
    if (!context.template) throw Object.assign(new Error("Template Meta ainda não aprovado para este gatilho."), { permanent: true });
    if (!context.preference?.whatsapp_transactional_opt_in || context.preference?.opt_out_at) throw Object.assign(new Error("Destinatário sem consentimento transacional ativo."), { permanent: true });
    if (["appointment_reminder_24h","appointment_reminder_3h"].includes(job.template_purpose) && ["cancelado","faltou","concluido"].includes(context.booking.status)) {
      await supabaseAdmin.from("notification_jobs").update({ status: "cancelled", cancelled_at: new Date().toISOString(), locked_at: null, locked_by: null }).eq("id", job.id);
      return { cancelled: true };
    }
    if (["booking_payment_pending","payment_expiring","payment_expired"].includes(job.template_purpose) && context.publicBooking?.pagamento_status !== "pendente") {
      await supabaseAdmin.from("notification_jobs").update({ status: "cancelled", cancelled_at: new Date().toISOString(), locked_at: null, locked_by: null }).eq("id", job.id);
      return { cancelled: true };
    }
    const quickReplyPayload = await confirmationInteraction(job, context.booking);
    const paymentLink = await trackedPaymentLink(job, context.booking, context.publicBooking);
    const { data: stored, error: storeError } = await supabaseAdmin.from("whatsapp_messages").upsert({
      clinica_id: job.clinica_id, connection_id: context.connection.id, cliente_id: context.booking.cliente_id,
      agendamento_id: context.booking.id, direction: "outbound", message_type: "template",
      template_name: context.template.name, template_category: context.template.category,
      recipient_phone: job.recipient, sender_phone: context.connection.display_phone_number,
      status: "queued", trigger: job.template_purpose, domain_event_id: context.event.id, job_id: job.id,
      content: { purpose: job.template_purpose, label: PURPOSE_LABELS[job.template_purpose] },
    }, { onConflict: "job_id" }).select("id").single();
    if (storeError) throw storeError;
    const variables = templateVariables({ job, ...context });
    if (["booking_payment_pending","payment_expiring"].includes(job.template_purpose)) variables.push(paymentLink || "-");
    const response = await provider.sendTemplate({ connection: context.connection, template: context.template, to: job.recipient, variables, quickReplyPayload });
    const metaId = response?.messages?.[0]?.id || null; const now = new Date().toISOString();
    await Promise.all([
      supabaseAdmin.from("whatsapp_messages").update({ meta_message_id: metaId, status: "submitted", submitted_at: now }).eq("id", stored.id),
      supabaseAdmin.from("notification_jobs").update({ status: "sent", sent_at: now, locked_at: null, locked_by: null, last_error: null }).eq("id", job.id),
      analytics(job.clinica_id, "whatsapp_sent", { message_id: stored.id, purpose: job.template_purpose }),
    ]);
    if (["booking_payment_pending","payment_expiring"].includes(job.template_purpose) && context.publicBooking?.invoice_url) await analytics(job.clinica_id, "payment_link_sent", { message_id: stored.id, agendamento_id: context.booking.id });
    return { id: stored.id, metaId };
  } catch (error) {
    const permanent = error?.permanent === true || error?.transient === false || Number(job.attempt_count || 0) >= Number(job.max_attempts || 5);
    const message = sanitizeMetaError(error);
    await supabaseAdmin.from("notification_jobs").update({ status: permanent ? "failed" : "retry", scheduled_at: permanent ? job.scheduled_at : nextRetryAt(job.attempt_count), locked_at: null, locked_by: null, last_error: message }).eq("id", job.id);
    await analytics(job.clinica_id, "whatsapp_failed", { job_id: job.id, purpose: job.template_purpose, permanent });
    throw error;
  }
}

export async function runNotificationWorker({ workerId = `worker:${randomUUID()}`, batchSize = 25 } = {}) {
  const summary = { workerId, outbox: 0, jobs: 0, errors: 0 };
  const { data: events, error: outboxError } = await supabaseAdmin.rpc("claim_domain_outbox_events", { p_worker: workerId, p_limit: batchSize });
  if (outboxError) throw outboxError;
  for (const event of events || []) { try { await processOutboxEvent(event); summary.outbox += 1; } catch { summary.errors += 1; } }
  const { data: jobs, error: jobsError } = await supabaseAdmin.rpc("claim_notification_jobs", { p_worker: workerId, p_limit: batchSize });
  if (jobsError) throw jobsError;
  for (const job of jobs || []) { try { await processNotificationJob(job); summary.jobs += 1; } catch { summary.errors += 1; } }
  return summary;
}
