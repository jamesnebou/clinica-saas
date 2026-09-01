"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAsaasCustomerForPatient, createAsaasPaymentForBooking, isAsaasConfigured } from "@/lib/asaas/client";
import { createInfinitePayCheckout } from "@/lib/infinitepay/client";
import { resolveClinicPaymentProvider } from "@/lib/payments/provider";
import { notifyClinicPublicBooking } from "@/lib/notifications/booking";
import { clinicTimeZone, dateFromClinicLocal, isWithinWorkingPeriods } from "@/lib/clinic/schedule";
import { totalAppointmentMinutes } from "@/lib/domain/schedule-core.mjs";
import { decryptClinicSecrets } from "@/lib/security/clinic-secrets";
import { emitDomainEvent, upsertTransactionalConsent } from "@/lib/whatsapp/events";
import { getTrustedAppOrigin } from "@/lib/security/app-origin";

function text(formData, key) {
  return String(formData.get(key) || "").trim();
}

function nullableText(formData, key) {
  const value = text(formData, key);
  return value || null;
}

function uniqueTexts(formData, key) {
  return Array.from(new Set(formData.getAll(key).map((value) => String(value || "").trim()).filter(Boolean)));
}

function procedureSummary(procedimentos) {
  return procedimentos.map((item) => item.nome).join(", ");
}

function calculateTotalDeposit(procedimentos) {
  return Number(procedimentos.reduce((total, item) => total + calculateDeposit(item), 0).toFixed(2));
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function attributionFromForm(formData) {
  return {
    source: nullableText(formData, "source"),
    medium: nullableText(formData, "medium"),
    campaign: nullableText(formData, "campaign"),
    content: nullableText(formData, "content"),
    term: nullableText(formData, "term"),
    referrer: nullableText(formData, "referrer"),
    landing_page: nullableText(formData, "landing_page"),
  };
}

async function insertAttributedOpportunity(payload, attribution) {
  const enriched = { ...payload, ...attribution, origem: attribution.source || payload.origem };
  const { error } = await supabaseAdmin.from("crm_oportunidades").insert(enriched);
  if (!error) return null;
  if (!["42703", "PGRST204"].includes(error.code)) return error;
  const { error: legacyError } = await supabaseAdmin.from("crm_oportunidades").insert(payload);
  return legacyError;
}

async function createCrm2Opportunity({ payload, attribution, semanticKey = "new", procedureId = null }) {
  const ensured = await supabaseAdmin.rpc("crm_ensure_default_pipeline", { p_clinica_id: payload.clinica_id });
  if (ensured.error && ["42883", "PGRST202"].includes(ensured.error.code)) {
    const legacyError = await insertAttributedOpportunity(payload, attribution);
    return { data: null, error: legacyError };
  }
  if (ensured.error) return { data: null, error: ensured.error };
  const { data: stage, error: stageError } = await supabaseAdmin.from("crm_pipeline_stages").select("id").eq("clinica_id", payload.clinica_id).eq("pipeline_id", ensured.data).eq("semantic_key", semanticKey).eq("ativo", true).maybeSingle();
  if (stageError) return { data: null, error: stageError };
  return supabaseAdmin.rpc("crm_create_opportunity", {
    p_clinica_id: payload.clinica_id,
    p_cliente_id: payload.cliente_id || null,
    p_nome: payload.nome,
    p_titulo: payload.titulo || payload.proxima_acao || "Nova oportunidade",
    p_telefone: payload.telefone || null,
    p_email: payload.email || null,
    p_origem: attribution.source || payload.origem || "site",
    p_valor: Number(payload.valor_estimado || 0),
    p_pipeline_id: ensured.data,
    p_stage_id: stage?.id || null,
    p_procedimento_id: procedureId,
    p_responsavel_id: null,
    p_temperatura: "morno",
    p_score: attribution.campaign ? 65 : 50,
    p_observacoes: payload.observacoes || null,
    p_attribution: attribution,
    p_identificador_externo: payload.identificador_externo || null,
  });
}

async function recordPublicEvent({ clinicId, clienteId = null, eventName, attribution, metadata = {} }) {
  const { error } = await supabaseAdmin.from("eventos_analiticos").insert({
    clinica_id: clinicId,
    contato_id: clienteId,
    event_name: eventName,
    ...attribution,
    metadata,
  });
  if (error && !["42P01", "PGRST205"].includes(error.code)) console.error(`Erro ao registrar evento ${eventName}:`, error.message);
}

function publicRedirect(slug, params) {
  const query = new URLSearchParams(params).toString();
  redirect(`/c/${slug}${query ? `?${query}` : ""}#agendar`);
}

async function publicAppOrigin() {
  return getTrustedAppOrigin();
}

function publicLeadRedirect(slug, params) {
  const query = new URLSearchParams(params).toString();
  redirect(`/c/${slug}${query ? `?${query}` : ""}#form`);
}

function calculateDeposit(procedimento) {
  const price = Number(procedimento?.preco_promocional ?? procedimento?.preco ?? 0);
  const fixed = Number(procedimento?.sinal_valor || 0);
  const percent = Number(procedimento?.sinal_percentual || 0);
  const value = fixed > 0 ? fixed : percent > 0 ? price * (percent / 100) : 0;
  return Math.max(0, Math.min(price, Number(value.toFixed(2))));
}

function assertWorkingHours({ clinic, start, end, slug, timeZone }) {
  const schedule = clinic?.metadata?.horario_funcionamento || {};

  if (!isWithinWorkingPeriods({ schedule, startDate: start, endDate: end, timeZone })) {
    publicRedirect(slug, { erro: "agenda", mensagem: "Este horário está fora do expediente da clínica." });
  }
}

async function assertSlotAvailable({ clinicId, profissionalId, startISO, endISO, slug }) {
  if (!profissionalId) return;

  const { data, error } = await supabaseAdmin
    .from("agendamentos")
    .select("id")
    .eq("clinica_id", clinicId)
    .eq("profissional_id", profissionalId)
    .not("status", "eq", "cancelado")
    .lt("inicio", endISO)
    .gt("fim", startISO)
    .limit(1);

  if (error) throw error;
  if (data?.length) {
    publicRedirect(slug, { erro: "agenda", mensagem: "Este horário acabou de ser preenchido. Escolha outro horário." });
  }
}

export async function createPublicBookingAction(formData) {
  const slug = text(formData, "slug");
  const procedimentoIds = uniqueTexts(formData, "procedimento_ids");
  const procedimentoId = procedimentoIds[0] || text(formData, "procedimento_id");
  const profissionalId = nullableText(formData, "profissional_id") || nullableText(formData, "profissional_disponivel_id");
  const nome = text(formData, "nome");
  const telefone = nullableText(formData, "telefone");
  const email = nullableText(formData, "email");
  const cpf = nullableText(formData, "cpf");
  const dataHora = text(formData, "data_hora");
  const consentimento = formData.get("consentimento_lgpd") === "on";
  const whatsappTransactionalOptIn = formData.get("whatsapp_transactional_opt_in") === "on";
  const attribution = attributionFromForm(formData);

  if (!slug || !procedimentoId || !nome || !telefone || !email || !dataHora) {
    publicRedirect(slug || "", { erro: "dados", mensagem: "Preencha nome, WhatsApp e e-mail para concluir o agendamento." });
  }

  if (!consentimento) {
    publicRedirect(slug, { erro: "lgpd", mensagem: "Aceite a política de privacidade para concluir o agendamento." });
  }

  const { data: clinic, error: clinicError } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, status, email, telefone, metadata")
    .eq("slug", slug)
    .in("status", ["trial", "ativa"])
    .maybeSingle();

  if (clinicError) throw clinicError;
  if (!clinic) publicRedirect(slug, { erro: "clínica", mensagem: "Clínica indisponível para agendamento online." });

  const { data: integration, error: integrationError } = await supabaseAdmin
    .from("clinica_integracoes")
    .select("clinica_id, pagamento_gateway, asaas_ativo, asaas_api_key, asaas_base_url, asaas_configuracao_publica, asaas_segredos_criptografados, infinitepay_ativo, infinitepay_handle, infinitepay_configuracao_publica, email_ativo, email_destino, email_remetente, whatsapp_ativo, whatsapp_provider, whatsapp_numero_destino, whatsapp_webhook_url, whatsapp_token")
    .eq("clinica_id", clinic.id)
    .maybeSingle();

  if (integrationError) throw integrationError;
  const integrationSecrets = decryptClinicSecrets(integration?.asaas_segredos_criptografados);
  const clinicIntegration = integration ? { ...integration, apiKey: integrationSecrets.apiKey || integration.asaas_api_key, baseUrl: integration.asaas_configuracao_publica?.baseUrl || integration.asaas_base_url } : { clinica_id: clinic.id };
  const paymentProvider = resolveClinicPaymentProvider(clinicIntegration);

  const siteConfig = clinic.metadata?.site_publico || {};
  if (siteConfig.publicado === false) {
    publicRedirect(slug, { erro: "site", mensagem: "O agendamento online desta clínica ainda nao esta publicado." });
  }

  const selectedIds = procedimentoIds.length ? procedimentoIds : [procedimentoId];
  const { data: procedimentosSelecionados = [], error: procedimentoError } = await supabaseAdmin
    .from("procedimentos")
    .select("id, nome, descricao, duracao_minutos, intervalo_minutos, preco, preco_promocional, sinal_percentual, sinal_valor, publicado_site, ativo, crm_booking_behavior")
    .eq("clinica_id", clinic.id)
    .in("id", selectedIds)
    .eq("ativo", true)
    .eq("publicado_site", true);

  if (procedimentoError) throw procedimentoError;
  if (procedimentosSelecionados.length !== selectedIds.length) {
    publicRedirect(slug, { erro: "procedimento", mensagem: "Um ou mais procedimentos estão indisponíveis para agendamento online." });
  }

  const procedimentosById = new Map(procedimentosSelecionados.map((item) => [item.id, item]));
  const procedimentos = selectedIds.map((id) => procedimentosById.get(id)).filter(Boolean);
  const procedimento = procedimentos[0];
  const procedimentosTexto = procedureSummary(procedimentos);

  const timeZone = clinicTimeZone(clinic);
  const start = dateFromClinicLocal(dataHora, timeZone);
  if (!start || start < new Date()) {
    publicRedirect(slug, { erro: "agenda", mensagem: "Escolha uma data futura válida." });
  }

  const duracaoTotal = totalAppointmentMinutes(procedimentos, { defaultDuration: 60, includeIntervals: true });
  const end = new Date(start.getTime() + duracaoTotal * 60000);
  assertWorkingHours({ clinic, start, end, slug, timeZone });

  if (!profissionalId) {
    publicRedirect(slug, { erro: "agenda", mensagem: "Escolha um horário disponível para concluir o agendamento." });
  }

  await assertSlotAvailable({
    clinicId: clinic.id,
    profissionalId,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    slug,
  });

  let existingQuery = supabaseAdmin.from("clientes").select("id").eq("clinica_id", clinic.id).limit(1);
  if (email) {
    existingQuery = existingQuery.eq("email", email);
  } else {
    existingQuery = existingQuery.eq("telefone", telefone || "__sem_telefone__");
  }

  const { data: existingClientes, error: existingError } = await existingQuery;

  if (existingError) throw existingError;
  let clienteId = existingClientes?.[0]?.id || null;

  if (!clienteId) {
    const { data: cliente, error: clienteError } = await supabaseAdmin
      .from("clientes")
      .insert({
        clinica_id: clinic.id,
        nome,
        telefone,
        email,
        cpf,
        origem: "Site",
        status: "lead",
        observacoes: `Lead criado pelo site publico. Telefone normalizado: ${normalizePhone(telefone) || "-"}.`,
        consentimento_lgpd: true,
        data_consentimento_lgpd: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (clienteError) throw clienteError;
    clienteId = cliente.id;
  }

  if (whatsappTransactionalOptIn) {
    await upsertTransactionalConsent({
      clinicId: clinic.id,
      clientId: clienteId,
      phone: telefone,
      accepted: true,
      source: "public_booking",
    }).catch((error) => {
      console.error("whatsapp_consent_registration_failed", { clinicId: clinic.id, code: error?.code || "unknown" });
    });
  }

  const valorTotal = Number(procedimentos.reduce((total, item) => total + Number(item.preco_promocional ?? item.preco ?? 0), 0).toFixed(2));
  const valorSinal = calculateTotalDeposit(procedimentos);
  const pagamentoStatus = valorSinal > 0 ? "pendente" : "sem_sinal";

  if (valorSinal > 0 && !paymentProvider) {
    publicRedirect(slug, { erro: "pagamento", mensagem: "Checkout online indisponível no momento. A clínica precisa conectar Asaas ou InfinitePay para receber o sinal pelo site." });
  }

  const { data: agendamento, error: agendaError } = await supabaseAdmin
    .from("agendamentos")
    .insert({
      clinica_id: clinic.id,
      cliente_id: clienteId,
      profissional_id: profissionalId,
      procedimento_id: procedimento.id,
      inicio: start.toISOString(),
      fim: end.toISOString(),
      status: "agendado",
      valor: valorTotal,
      pagamento_status: pagamentoStatus === "sem_sinal" ? "pendente" : "parcial",
      valor_pago: 0,
      observacoes: `Agendamento criado pelo site público. Procedimentos: ${procedimentosTexto}. Duração total: ${duracaoTotal} min.`,
    })
      .select("id")
      .single();

  if (agendaError?.code === "23P01") {
    publicRedirect(slug, { erro: "horario", mensagem: "Este horário acabou de ser ocupado. Escolha outra opção disponível." });
  }
  if (agendaError) throw agendaError;

  let invoiceUrl = null;
  let asaasPaymentId = null;
  let paymentExternalId = null;
  let paymentPayload = {};

  if (valorSinal > 0 && paymentProvider) {
    try {
      if (paymentProvider === "asaas" && isAsaasConfigured(clinicIntegration)) {
        const customer = await createAsaasCustomerForPatient({ clinicId: clinic.id, nome, email, telefone, cpf, integration: clinicIntegration });
        const payment = await createAsaasPaymentForBooking({
          customerId: customer.id,
          value: valorSinal,
          description: `Sinal ${procedimentosTexto} - ${clinic.nome}`,
          externalReference: agendamento.id,
          billingType: "UNDEFINED",
          integration: clinicIntegration,
        });
        invoiceUrl = payment.invoiceUrl || payment.bankSlipUrl || null;
        asaasPaymentId = payment.id || null;
        paymentExternalId = asaasPaymentId;
        paymentPayload = payment || {};
      } else if (paymentProvider === "infinitepay") {
        const origin = await publicAppOrigin();
        const orderNsu = `agendamento:${agendamento.id}`;
        const checkout = await createInfinitePayCheckout({
          handle: clinicIntegration.infinitepay_handle,
          orderNsu,
          redirectUrl: `${origin}/c/${slug}?pagamento=retorno#agendar`,
          webhookUrl: `${origin}/api/webhooks/infinitepay`,
          items: [{
            quantity: 1,
            price: Math.round(valorSinal * 100),
            description: `Sinal ${procedimentosTexto} - ${clinic.nome}`,
          }],
          customer: { name: nome, email, phone: telefone },
        });
        invoiceUrl = checkout.url;
        paymentExternalId = orderNsu;
        paymentPayload = checkout;
      }
    } catch (error) {
      await supabaseAdmin.from("agendamentos").delete().eq("id", agendamento.id).eq("clinica_id", clinic.id);
      publicRedirect(slug, { erro: "pagamento", mensagem: error.message || "Não foi possível gerar o checkout do sinal. Tente novamente." });
    }
  }

  const { data: publicBooking, error: publicError } = await supabaseAdmin.from("site_agendamentos_publicos").insert({
    clinica_id: clinic.id,
    cliente_id: clienteId,
    agendamento_id: agendamento.id,
    procedimento_id: procedimento.id,
    profissional_id: profissionalId,
    nome,
    telefone,
    email,
    data_hora: start.toISOString(),
    valor_total: valorTotal,
    valor_sinal: valorSinal,
    pagamento_status: invoiceUrl ? "pendente" : pagamentoStatus,
    pagamento_gateway: paymentProvider,
    pagamento_external_id: paymentExternalId,
    asaas_payment_id: asaasPaymentId,
    invoice_url: invoiceUrl,
    payload: {
      pagamento: paymentPayload,
      pagamento_gateway: paymentProvider,
      procedimentos: procedimentos.map((item) => ({
        id: item.id,
        nome: item.nome,
        preco: Number(item.preco_promocional ?? item.preco ?? 0),
        duracao_minutos: Number(item.duracao_minutos || 60),
        intervalo_minutos: Number(item.intervalo_minutos || 0),
        sinal: calculateDeposit(item),
      })),
      duracao_total_minutos: duracaoTotal,
    },
  }).select("id, nome, telefone, email, data_hora, valor_total, valor_sinal, pagamento_status, payload").single();

  if (publicError) throw publicError;

  const crmBehavior = procedimentos.find((item) => ["direct_sale", "opportunity", "evaluation"].includes(item.crm_booking_behavior))?.crm_booking_behavior || "none";
  const crmSemanticKey = crmBehavior === "evaluation" ? "evaluation_scheduled" : crmBehavior === "direct_sale" ? "negotiation" : "new";
  const crmResult = crmBehavior === "none" ? { data: null, error: null } : await createCrm2Opportunity({ payload: {
    clinica_id: clinic.id,
    cliente_id: clienteId,
    nome,
    titulo: `${crmBehavior === "direct_sale" ? "Venda" : "Interesse"}: ${procedimentosTexto}`,
    telefone,
    email,
    origem: "site",
    status: "avaliacao_marcada",
    valor_estimado: valorTotal,
    proxima_acao_em: start.toISOString(),
    proxima_acao: `Atendimento agendado: ${procedimentosTexto}`,
    observacoes: invoiceUrl ? `Criado automaticamente pelo site público com checkout de sinal via ${paymentProvider === "infinitepay" ? "InfinitePay" : "Asaas"}. Procedimentos: ${procedimentosTexto}.` : `Criado automaticamente pelo site público. Procedimentos: ${procedimentosTexto}.`,
  }, attribution, semanticKey: crmSemanticKey, procedureId: procedimento.id });
  if (crmResult.error) console.error("crm_public_booking_failed", { clinicId: clinic.id, code: crmResult.error.code || "unknown" });
  const crmOpportunityId = crmResult.data?.id || null;
  if (crmOpportunityId) {
    const linkResults = await Promise.all([
      supabaseAdmin.from("agendamentos").update({ crm_oportunidade_id: crmOpportunityId }).eq("clinica_id", clinic.id).eq("id", agendamento.id),
      supabaseAdmin.from("site_agendamentos_publicos").update({ crm_oportunidade_id: crmOpportunityId }).eq("clinica_id", clinic.id).eq("id", publicBooking.id),
      supabaseAdmin.from("crm_opportunity_appointments").upsert({ clinica_id: clinic.id, opportunity_id: crmOpportunityId, agendamento_id: agendamento.id }, { onConflict: "opportunity_id,agendamento_id" }),
    ]);
    const linkError = linkResults.map((result) => result.error).find(Boolean);
    if (linkError) console.error("crm_public_booking_link_failed", { clinicId: clinic.id, code: linkError.code || "unknown" });
  }

  await recordPublicEvent({
    clinicId: clinic.id,
    clienteId,
    eventName: "booking_created",
    attribution,
    metadata: { agendamento_id: agendamento.id, valor_total: valorTotal, valor_sinal: valorSinal, gateway: paymentProvider, quantidade_procedimentos: procedimentos.length },
  });

  await emitDomainEvent({
    clinicId: clinic.id,
    eventName: "booking.created",
    aggregateId: agendamento.id,
    payload: { source: "public_site", public_booking_id: publicBooking.id },
    idempotencyKey: `booking.created:${agendamento.id}:v1`,
  }).catch((error) => {
    console.error("whatsapp_booking_event_failed", { clinicId: clinic.id, code: error?.code || "unknown" });
  });

  if (invoiceUrl) {
    await emitDomainEvent({
      clinicId: clinic.id,
      eventName: "payment.pending",
      aggregateId: agendamento.id,
      payload: { source: paymentProvider, public_booking_id: publicBooking.id },
      idempotencyKey: `payment.pending:${agendamento.id}:${paymentExternalId || publicBooking.id}`,
    }).catch((error) => {
      console.error("whatsapp_payment_pending_event_failed", { clinicId: clinic.id, code: error?.code || "unknown" });
    });
  }

  revalidatePath(`/c/${slug}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agenda");

  await notifyClinicPublicBooking({
    clinic,
    booking: publicBooking,
    procedimento: { ...procedimento, nome: procedimentosTexto },
    invoiceUrl,
    integration: clinicIntegration,
  });

  if (invoiceUrl) {
    redirect(invoiceUrl);
  }

  publicRedirect(slug, { ok: "agendamento", mensagem: "Agendamento solicitado com sucesso." });
}

export async function createPublicLeadAction(formData) {
  const slug = text(formData, "slug");
  const nome = text(formData, "nome");
  const telefone = nullableText(formData, "telefone");
  const email = nullableText(formData, "email");
  const mensagem = nullableText(formData, "mensagem");
  const attribution = attributionFromForm(formData);

  if (!slug || !nome || !telefone) {
    publicLeadRedirect(slug || "", { lead_erro: "dados", mensagem: "Informe nome completo e telefone para enviar sua solicitação." });
  }

  const { data: clinic, error: clinicError } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, status, metadata")
    .eq("slug", slug)
    .in("status", ["trial", "ativa"])
    .maybeSingle();

  if (clinicError) throw clinicError;
  if (!clinic) publicLeadRedirect(slug, { lead_erro: "clinica", mensagem: "Clínica indisponível para receber solicitações agora." });

  const siteConfig = clinic.metadata?.site_publico || {};
  if (siteConfig.publicado === false) {
    publicLeadRedirect(slug, { lead_erro: "site", mensagem: "O site desta clínica ainda não está publicado." });
  }

  let contactQuery = supabaseAdmin.from("clientes").select("id").eq("clinica_id", clinic.id).limit(1);
  contactQuery = email ? contactQuery.ilike("email", email) : contactQuery.eq("telefone", telefone);
  const { data: existingContact, error: contactReadError } = await contactQuery.maybeSingle();
  if (contactReadError) throw contactReadError;
  let contactId = existingContact?.id || null;
  if (!contactId) {
    const { data: createdContact, error: contactCreateError } = await supabaseAdmin.from("clientes").insert({ clinica_id: clinic.id, nome, telefone, email, origem: "Site", status: "lead", observacoes: mensagem || "Solicitou mais informações pelo site." }).select("id").single();
    if (contactCreateError) throw contactCreateError;
    contactId = createdContact.id;
  }
  const result = await createCrm2Opportunity({ payload: {
    clinica_id: clinic.id,
    cliente_id: contactId,
    nome,
    titulo: "Solicitação de informações pelo site",
    telefone,
    email,
    origem: "site",
    status: "lead",
    proxima_acao: "Responder solicitação enviada pelo site.",
    observacoes: mensagem || "Lead solicitou mais informações pelo site público.",
  }, attribution, semanticKey: "new" });

  if (result.error) {
    publicLeadRedirect(slug, { lead_erro: "crm", mensagem: "Não foi possível enviar sua solicitação agora. Tente novamente." });
  }

  await recordPublicEvent({ clinicId: clinic.id, eventName: "lead_created", attribution, metadata: { channel: "public_site_form" } });

  revalidatePath("/dashboard/crm");
  revalidatePath(`/c/${slug}`);
  publicLeadRedirect(slug, { lead: "ok" });
}
