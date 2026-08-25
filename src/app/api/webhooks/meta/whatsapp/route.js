import { NextResponse } from "next/server";
import { safeTokenEquals } from "@/lib/whatsapp/core.mjs";
import { ingestWhatsAppWebhook, verifyWebhookSignature } from "@/lib/whatsapp/meta/webhooks";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 1_000_000;

export async function GET(request) {
  const url = new URL(request.url); const mode = url.searchParams.get("hub.mode"); const token = url.searchParams.get("hub.verify_token"); const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && challenge && safeTokenEquals(token, process.env.META_WEBHOOK_VERIFY_TOKEN || "__missing__")) return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  return NextResponse.json({ error: "Verificação inválida." }, { status: 403 });
}

export async function POST(request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload excede o limite." }, { status: 413 });
  if (!verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  let payload; try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  if (payload?.object !== "whatsapp_business_account") return NextResponse.json({ ok: true, ignored: true });
  try { const result = await ingestWhatsAppWebhook(payload); return NextResponse.json({ ok: true, ...result }); }
  catch (error) { console.error("meta_whatsapp_webhook_failed", { message: error?.message }); return NextResponse.json({ ok: false }, { status: 500 }); }
}

