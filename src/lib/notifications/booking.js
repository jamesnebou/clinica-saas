import { clinicTimeZone } from "@/lib/clinic/schedule";
import { supabaseAdmin } from "@/lib/supabase/admin";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value, clinic) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: clinicTimeZone(clinic),
  });
}

function procedureName(booking, procedimento) {
  const names = Array.isArray(booking?.payload?.procedimentos)
    ? booking.payload.procedimentos.map((item) => item?.nome).filter(Boolean)
    : [];
  return names.length ? names.join(", ") : procedimento?.nome || "Procedimento";
}

function detailsText({ clinic, booking, procedimento }) {
  return [
    `Clínica: ${clinic.nome}`,
    `Procedimento: ${procedureName(booking, procedimento)}`,
    `Data: ${formatDateTime(booking.data_hora, clinic)}`,
    `Valor total: ${formatMoney(booking.valor_total)}`,
    `Sinal: ${formatMoney(booking.valor_sinal)}`,
  ].join("\n");
}

function detailsHtml({ clinic, booking, procedimento }) {
  const rows = [
    ["Clínica", clinic.nome],
    ["Procedimento", procedureName(booking, procedimento)],
    ["Data e horário", formatDateTime(booking.data_hora, clinic)],
    ["Valor total", formatMoney(booking.valor_total)],
    ["Sinal", formatMoney(booking.valor_sinal)],
  ];

  return rows.map(([label, value]) => `
    <p style="margin:0 0 10px;font-size:14px;line-height:1.5;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>
  `).join("");
}

function emailShell({ eyebrow, title, intro, content, actionUrl, actionLabel, footer }) {
  return `
    <!doctype html>
    <html lang="pt-BR">
      <body style="margin:0;background:#f5f3f0;padding:24px;font-family:Arial,sans-serif;color:#171717;">
        <div style="max-width:640px;margin:0 auto;overflow:hidden;border:1px solid #e7e2dc;border-radius:18px;background:#ffffff;box-shadow:0 18px 50px rgba(23,23,23,.08);">
          <div style="height:5px;background:#ed7009;"></div>
          <div style="padding:32px;">
            <p style="margin:0 0 10px;text-transform:uppercase;letter-spacing:.16em;color:#ed7009;font-size:11px;font-weight:800;">${escapeHtml(eyebrow)}</p>
            <h1 style="margin:0;font-size:26px;line-height:1.2;font-weight:900;color:#171717;">${escapeHtml(title)}</h1>
            <p style="margin:16px 0 0;color:#525252;font-size:15px;line-height:1.7;">${escapeHtml(intro)}</p>
            <div style="margin-top:24px;border:1px solid #ece8e3;border-radius:14px;background:#faf9f7;padding:20px;">${content}</div>
            ${actionUrl && actionLabel ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;border-radius:999px;background:#1c1c1c;color:#ffffff;padding:13px 22px;text-decoration:none;font-size:14px;font-weight:800;">${escapeHtml(actionLabel)}</a></p>` : ""}
            <p style="margin:26px 0 0;color:#737373;font-size:12px;line-height:1.6;">${escapeHtml(footer)}</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function sendResendEmail({ to, replyTo, subject, text, html, idempotencyKey }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM_EMAIL || "").trim();
  if (!apiKey || !from || !to) return { skipped: true };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text,
      html,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message || payload?.error || "Não foi possível enviar o e-mail transacional.");
  }

  return response.json().catch(() => ({ ok: true }));
}

function customerBookingCopy({ booking, invoiceUrl }) {
  if (Number(booking.valor_sinal || 0) > 0) {
    return {
      title: "Reserva recebida. Pagamento pendente.",
      intro: "O horário foi reservado temporariamente e será confirmado após a identificação do pagamento do sinal.",
      actionLabel: invoiceUrl ? "Pagar sinal" : null,
    };
  }

  return {
    title: "Solicitação de agendamento recebida.",
    intro: "A clínica recebeu sua solicitação e poderá entrar em contato para confirmar os detalhes do atendimento.",
    actionLabel: null,
  };
}

async function sendCreatedEmails({ clinic, booking, procedimento, invoiceUrl, integration }) {
  if (!integration?.email_ativo) return [{ status: "fulfilled", value: { skipped: true } }];
  const clinicEmail = integration.email_destino || clinic.email;
  const copy = customerBookingCopy({ booking, invoiceUrl });
  const tasks = [];

  if (clinicEmail) {
    tasks.push(sendResendEmail({
      to: clinicEmail,
      replyTo: booking.email || null,
      subject: `Novo agendamento pelo site - ${booking.nome}`,
      text: `Nova solicitação de agendamento.\nCliente: ${booking.nome}\n${detailsText({ clinic, booking, procedimento })}${invoiceUrl ? `\nCheckout: ${invoiceUrl}` : ""}`,
      html: emailShell({
        eyebrow: "Novo agendamento pelo site",
        title: booking.nome,
        intro: `${booking.nome} solicitou um atendimento pela página pública da clínica.`,
        content: detailsHtml({ clinic, booking, procedimento }),
        actionUrl: invoiceUrl,
        actionLabel: invoiceUrl ? "Abrir checkout" : null,
        footer: "Aviso operacional enviado automaticamente pela NexaWi Clínicas.",
      }),
      idempotencyKey: `public-booking-created-clinic-${booking.id}`,
    }));
  }

  if (booking.email) {
    tasks.push(sendResendEmail({
      to: booking.email,
      replyTo: clinicEmail || null,
      subject: `${copy.title} - ${clinic.nome}`,
      text: `${copy.title}\n${copy.intro}\n${detailsText({ clinic, booking, procedimento })}${invoiceUrl ? `\nPagamento: ${invoiceUrl}` : ""}`,
      html: emailShell({
        eyebrow: clinic.nome,
        title: copy.title,
        intro: copy.intro,
        content: detailsHtml({ clinic, booking, procedimento }),
        actionUrl: invoiceUrl,
        actionLabel: copy.actionLabel,
        footer: `Em caso de dúvida, responda este e-mail para falar com ${clinic.nome}.`,
      }),
      idempotencyKey: `public-booking-created-customer-${booking.id}`,
    }));
  }

  return Promise.allSettled(tasks);
}

async function sendPaidEmails({ clinic, booking, procedimento, integration }) {
  if (!integration?.email_ativo) return [{ status: "fulfilled", value: { skipped: true } }];
  const clinicEmail = integration.email_destino || clinic.email;
  const tasks = [];

  if (booking.email) {
    tasks.push(sendResendEmail({
      to: booking.email,
      replyTo: clinicEmail || null,
      subject: `Pagamento confirmado - ${clinic.nome}`,
      text: `Pagamento confirmado. Seu agendamento está garantido.\n${detailsText({ clinic, booking, procedimento })}`,
      html: emailShell({
        eyebrow: "Pagamento confirmado",
        title: "Seu agendamento está garantido.",
        intro: `${clinic.nome} confirmou o recebimento do sinal da sua reserva.`,
        content: detailsHtml({ clinic, booking, procedimento }),
        footer: `Em caso de dúvida, responda este e-mail para falar com ${clinic.nome}.`,
      }),
      idempotencyKey: `public-booking-paid-customer-${booking.id}`,
    }));
  }

  if (clinicEmail) {
    tasks.push(sendResendEmail({
      to: clinicEmail,
      replyTo: booking.email || null,
      subject: `Sinal confirmado - ${booking.nome}`,
      text: `Pagamento do sinal confirmado para ${booking.nome}.\n${detailsText({ clinic, booking, procedimento })}`,
      html: emailShell({
        eyebrow: "Sinal recebido",
        title: `Pagamento de ${booking.nome} confirmado.`,
        intro: "O agendamento público foi atualizado automaticamente para confirmado.",
        content: detailsHtml({ clinic, booking, procedimento }),
        footer: "Aviso operacional enviado automaticamente pela NexaWi Clínicas.",
      }),
      idempotencyKey: `public-booking-paid-clinic-${booking.id}`,
    }));
  }

  return Promise.allSettled(tasks);
}

function reportRejected(results, context) {
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`Erro ao enviar ${context}:`, result.reason);
    }
  }
}

export async function sendWhatsAppIntegrationTest() {
  throw new Error("WhatsApp será configurado em uma etapa separada.");
}

export async function sendEmailIntegrationTest({ clinic, integration }) {
  if (!integration?.email_ativo) {
    throw new Error("Ative as notificações por e-mail antes de enviar o teste.");
  }

  const to = integration.email_destino || clinic.email;
  if (!to) throw new Error("Informe o e-mail operacional da clínica.");

  return sendResendEmail({
    to,
    replyTo: to,
    subject: `Teste de e-mail - ${clinic.nome}`,
    text: `A integração de e-mail de ${clinic.nome} com a NexaWi Clínicas está funcionando.`,
    html: emailShell({
      eyebrow: "Integração concluída",
      title: "O envio de e-mail está funcionando.",
      intro: `${clinic.nome} já pode receber avisos e enviar confirmações de reserva aos clientes.`,
      content: '<p style="margin:0;font-size:14px;line-height:1.6;">Este é um teste seguro, sem dados de clientes ou agendamentos.</p>',
      footer: "E-mail de teste enviado automaticamente pela NexaWi Clínicas.",
    }),
  });
}

export async function notifyClinicPublicBooking(args) {
  const results = await sendCreatedEmails(args);
  reportRejected(results, "e-mail de novo agendamento");
  return results;
}

export async function notifyPublicBookingPaymentConfirmed({ clinic, booking, procedimento, integration }) {
  const results = await sendPaidEmails({ clinic, booking, procedimento, integration });
  reportRejected(results, "e-mail de confirmação de pagamento");
  return results;
}

export async function notifyPublicBookingPaymentConfirmedById(bookingId) {
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("site_agendamentos_publicos")
    .select("id, clinica_id, procedimento_id, nome, email, data_hora, valor_total, valor_sinal, pagamento_status, payload")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking?.id || booking.pagamento_status !== "pago") return { skipped: true };

  const [clinicResult, integrationResult, procedureResult] = await Promise.all([
    supabaseAdmin.from("clinicas").select("id, nome, email, metadata").eq("id", booking.clinica_id).maybeSingle(),
    supabaseAdmin.from("clinica_integracoes").select("email_ativo, email_destino").eq("clinica_id", booking.clinica_id).maybeSingle(),
    booking.procedimento_id
      ? supabaseAdmin.from("procedimentos").select("id, nome").eq("id", booking.procedimento_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (clinicResult.error) throw clinicResult.error;
  if (integrationResult.error) throw integrationResult.error;
  if (procedureResult.error) throw procedureResult.error;
  if (!clinicResult.data?.id) return { skipped: true };

  return notifyPublicBookingPaymentConfirmed({
    clinic: clinicResult.data,
    booking,
    procedimento: procedureResult.data,
    integration: integrationResult.data,
  });
}
