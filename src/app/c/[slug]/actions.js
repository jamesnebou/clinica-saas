"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAsaasCustomerForPatient, createAsaasPaymentForBooking, isAsaasConfigured } from "@/lib/asaas/client";
import { notifyClinicPublicBooking } from "@/lib/notifications/booking";

function text(formData, key) {
  return String(formData.get(key) || "").trim();
}

function nullableText(formData, key) {
  const value = text(formData, key);
  return value || null;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function minutesFromTime(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function publicRedirect(slug, params) {
  const query = new URLSearchParams(params).toString();
  redirect(`/c/${slug}${query ? `?${query}` : ""}#agendar`);
}

function calculateDeposit(procedimento) {
  const price = Number(procedimento?.preco || 0);
  const fixed = Number(procedimento?.sinal_valor || 0);
  const percent = Number(procedimento?.sinal_percentual || 0);
  const value = fixed > 0 ? fixed : percent > 0 ? price * (percent / 100) : 0;
  return Math.max(0, Math.min(price, Number(value.toFixed(2))));
}

function assertWorkingHours({ clinic, start, end, slug }) {
  const schedule = clinic?.metadata?.horario_funcionamento || {};
  const startMinutes = minutesFromTime(schedule.inicio || "08:00");
  const endMinutes = minutesFromTime(schedule.fim || "18:00");
  const activeDays = Array.isArray(schedule.dias) && schedule.dias.length ? schedule.dias.map(String) : ["1", "2", "3", "4", "5", "6"];
  const day = String(start.getDay());

  if (!activeDays.includes(day)) {
    publicRedirect(slug, { erro: "agenda", mensagem: "Este dia nao esta disponivel para agendamento online." });
  }

  const startsAt = start.getHours() * 60 + start.getMinutes();
  const endsAt = end.getHours() * 60 + end.getMinutes();

  if (startMinutes === null || endMinutes === null || startsAt < startMinutes || endsAt > endMinutes) {
    publicRedirect(slug, { erro: "agenda", mensagem: "Este horario esta fora do expediente da clinica." });
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
    publicRedirect(slug, { erro: "agenda", mensagem: "Este horario acabou de ser preenchido. Escolha outro horario." });
  }
}

export async function createPublicBookingAction(formData) {
  const slug = text(formData, "slug");
  const procedimentoId = text(formData, "procedimento_id");
  const profissionalId = nullableText(formData, "profissional_id") || nullableText(formData, "profissional_disponivel_id");
  const nome = text(formData, "nome");
  const telefone = nullableText(formData, "telefone");
  const email = nullableText(formData, "email");
  const cpf = nullableText(formData, "cpf");
  const dataHora = text(formData, "data_hora");
  const consentimento = formData.get("consentimento_lgpd") === "on";

  if (!slug || !procedimentoId || !nome || !dataHora) {
    publicRedirect(slug || "", { erro: "dados", mensagem: "Preencha os dados obrigatorios para agendar." });
  }

  if (!consentimento) {
    publicRedirect(slug, { erro: "lgpd", mensagem: "Aceite a politica de privacidade para concluir o agendamento." });
  }

  const { data: clinic, error: clinicError } = await supabaseAdmin
    .from("clinicas")
    .select("id, nome, slug, status, email, telefone, metadata")
    .eq("slug", slug)
    .in("status", ["trial", "ativa"])
    .maybeSingle();

  if (clinicError) throw clinicError;
  if (!clinic) publicRedirect(slug, { erro: "clinica", mensagem: "Clinica indisponivel para agendamento online." });

  const siteConfig = clinic.metadata?.site_publico || {};
  if (siteConfig.publicado === false) {
    publicRedirect(slug, { erro: "site", mensagem: "O agendamento online desta clinica ainda nao esta publicado." });
  }

  const { data: procedimento, error: procedimentoError } = await supabaseAdmin
    .from("procedimentos")
    .select("id, nome, descricao, duracao_minutos, preco, sinal_percentual, sinal_valor, publicado_site, ativo")
    .eq("clinica_id", clinic.id)
    .eq("id", procedimentoId)
    .eq("ativo", true)
    .eq("publicado_site", true)
    .maybeSingle();

  if (procedimentoError) throw procedimentoError;
  if (!procedimento) publicRedirect(slug, { erro: "procedimento", mensagem: "Procedimento indisponivel para agendamento online." });

  const start = new Date(dataHora);
  if (Number.isNaN(start.getTime()) || start < new Date()) {
    publicRedirect(slug, { erro: "agenda", mensagem: "Escolha uma data futura valida." });
  }

  const end = new Date(start.getTime() + Number(procedimento.duracao_minutos || 60) * 60000);
  assertWorkingHours({ clinic, start, end, slug });

  if (!profissionalId) {
    publicRedirect(slug, { erro: "agenda", mensagem: "Escolha um horario disponivel para concluir o agendamento." });
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

  const valorTotal = Number(procedimento.preco || 0);
  const valorSinal = calculateDeposit(procedimento);
  const pagamentoStatus = valorSinal > 0 ? "pendente" : "sem_sinal";

  if (valorSinal > 0 && !isAsaasConfigured()) {
    publicRedirect(slug, { erro: "pagamento", mensagem: "Checkout online indisponivel no momento. A clinica precisa configurar o Asaas para receber o sinal pelo site." });
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
      observacoes: "Agendamento criado pelo site publico.",
    })
    .select("id")
    .single();

  if (agendaError) throw agendaError;

  let invoiceUrl = null;
  let asaasPaymentId = null;
  let paymentPayload = {};

  if (valorSinal > 0 && isAsaasConfigured()) {
    try {
      const customer = await createAsaasCustomerForPatient({ clinicId: clinic.id, nome, email, telefone, cpf });
      const payment = await createAsaasPaymentForBooking({
        customerId: customer.id,
        value: valorSinal,
        description: `Sinal ${procedimento.nome} - ${clinic.nome}`,
        externalReference: agendamento.id,
        billingType: "UNDEFINED",
      });
      invoiceUrl = payment.invoiceUrl || payment.bankSlipUrl || null;
      asaasPaymentId = payment.id || null;
      paymentPayload = payment || {};
    } catch (error) {
      await supabaseAdmin.from("agendamentos").delete().eq("id", agendamento.id).eq("clinica_id", clinic.id);
      publicRedirect(slug, { erro: "pagamento", mensagem: error.message || "Nao foi possivel gerar o checkout do sinal. Tente novamente." });
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
    pagamento_status: asaasPaymentId ? "pendente" : pagamentoStatus,
    asaas_payment_id: asaasPaymentId,
    invoice_url: invoiceUrl,
    payload: paymentPayload,
  }).select("id, nome, telefone, email, data_hora, valor_total, valor_sinal").single();

  if (publicError) throw publicError;

  await supabaseAdmin.from("crm_oportunidades").insert({
    clinica_id: clinic.id,
    cliente_id: clienteId,
    nome,
    telefone,
    email,
    origem: "site",
    status: "avaliacao_marcada",
    valor_estimado: valorTotal,
    proxima_acao_em: start.toISOString(),
    proxima_acao: `Atendimento agendado: ${procedimento.nome}`,
    observacoes: asaasPaymentId ? "Criado automaticamente pelo site publico com checkout de sinal." : "Criado automaticamente pelo site publico.",
  });

  revalidatePath(`/c/${slug}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agenda");

  await notifyClinicPublicBooking({
    clinic,
    booking: publicBooking,
    procedimento,
    invoiceUrl,
  });

  if (invoiceUrl) {
    redirect(invoiceUrl);
  }

  publicRedirect(slug, { ok: "agendamento", mensagem: "Agendamento solicitado com sucesso." });
}
