function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function notificationText({ clinic, booking, procedimento, invoiceUrl }) {
  return [
    `Novo agendamento direto do site - ${clinic.nome}`,
    `Cliente: ${booking.nome}`,
    `WhatsApp: ${booking.telefone || "-"}`,
    `E-mail: ${booking.email || "-"}`,
    `Procedimento: ${procedimento.nome}`,
    `Data: ${formatDateTime(booking.data_hora)}`,
    `Valor: ${formatMoney(booking.valor_total)}`,
    `Sinal: ${formatMoney(booking.valor_sinal)}`,
    invoiceUrl ? `Checkout: ${invoiceUrl}` : "",
  ].filter(Boolean).join("\n");
}

function notificationHtml({ clinic, booking, procedimento, invoiceUrl }) {
  return `
    <div style="font-family: Arial, sans-serif; color: #171717; line-height: 1.6;">
      <p style="text-transform: uppercase; letter-spacing: 0.18em; color: #047857; font-size: 12px; font-weight: 700;">Novo agendamento pelo site</p>
      <h1 style="margin: 8px 0 18px; font-size: 24px; font-weight: 900;">${clinic.nome}</h1>
      <div style="border: 1px solid #e5e5e5; border-radius: 12px; padding: 18px; background: #fafafa;">
        <p><strong>Cliente:</strong> ${booking.nome}</p>
        <p><strong>WhatsApp:</strong> ${booking.telefone || "-"}</p>
        <p><strong>E-mail:</strong> ${booking.email || "-"}</p>
        <p><strong>Procedimento:</strong> ${procedimento.nome}</p>
        <p><strong>Data:</strong> ${formatDateTime(booking.data_hora)}</p>
        <p><strong>Valor:</strong> ${formatMoney(booking.valor_total)}</p>
        <p><strong>Sinal:</strong> ${formatMoney(booking.valor_sinal)}</p>
      </div>
      ${invoiceUrl ? `<p style="margin-top: 20px;"><a href="${invoiceUrl}" style="display: inline-block; background: #111827; color: #ffffff; padding: 12px 18px; border-radius: 10px; text-decoration: none; font-weight: 700;">Abrir checkout do sinal</a></p>` : ""}
      <p style="margin-top: 24px; color: #737373; font-size: 13px;">Este aviso foi enviado automaticamente pelo sistema da clínica.</p>
    </div>
  `;
}

async function sendEmailNotification({ clinic, booking, procedimento, invoiceUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.BOOKING_NOTIFICATION_EMAIL || clinic.email;
  const from = process.env.RESEND_FROM_EMAIL || "Clinica SaaS <onboarding@resend.dev>";

  if (!apiKey || !to) return { skipped: true };

  const message = notificationText({ clinic, booking, procedimento, invoiceUrl });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `Agendamento direto do site - ${booking.nome}`,
      text: message,
      html: notificationHtml({ clinic, booking, procedimento, invoiceUrl }),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message || "Nao foi possivel enviar e-mail de notificacao.");
  }

  return response.json().catch(() => ({ ok: true }));
}

async function sendWhatsAppNotification({ clinic, booking, procedimento, invoiceUrl }) {
  const webhookUrl = process.env.WHATSAPP_NOTIFY_WEBHOOK_URL;
  const token = process.env.WHATSAPP_NOTIFY_TOKEN;
  const to = onlyDigits(process.env.BOOKING_NOTIFICATION_WHATSAPP || clinic.telefone);

  if (!webhookUrl || !to) return { skipped: true };

  const message = notificationText({ clinic, booking, procedimento, invoiceUrl });
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      to: to.startsWith("55") ? to : `55${to}`,
      message,
      clinic_id: clinic.id,
      booking_id: booking.id,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel enviar WhatsApp de notificacao.");
  }

  return response.json().catch(() => ({ ok: true }));
}

export async function notifyClinicPublicBooking({ clinic, booking, procedimento, invoiceUrl }) {
  const tasks = [
    sendEmailNotification({ clinic, booking, procedimento, invoiceUrl }),
    sendWhatsAppNotification({ clinic, booking, procedimento, invoiceUrl }),
  ];

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Erro ao enviar notificacao de agendamento:", result.reason);
    }
  }
}
