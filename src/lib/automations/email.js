import "server-only";

function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

export async function sendAutomationEmail({ to, subject, message, idempotencyKey }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM_EMAIL || "").trim();
  if (!apiKey || !from) return { status: "configuration_required", reason: "RESEND_NOT_CONFIGURED" };
  if (!to) return { status: "blocked", reason: "RECIPIENT_NOT_AVAILABLE" };
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ from, to: [to], subject, text: message, html: `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#171717"><h1 style="font-size:22px">${escapeHtml(subject)}</h1><p>${escapeHtml(message).replaceAll("\n", "<br>")}</p></div>` }), cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.message || "Falha ao enviar e-mail."), { code: response.status >= 500 ? "EMAIL_TRANSIENT" : "EMAIL_REJECTED", permanent: response.status < 500 });
  return { status: "completed", provider: "resend", providerId: body.id || null };
}
