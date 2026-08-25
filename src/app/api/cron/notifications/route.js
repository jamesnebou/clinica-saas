import { NextResponse } from "next/server";
import { runNotificationWorker } from "@/lib/whatsapp/engine";
import { safeTokenEquals } from "@/lib/whatsapp/core.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request) {
  const expected = String(process.env.CRON_SECRET || "");
  const authorization = String(request.headers.get("authorization") || "");
  return Boolean(expected && safeTokenEquals(authorization, `Bearer ${expected}`));
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  try {
    const result = await runNotificationWorker({ workerId: `vercel:${crypto.randomUUID()}`, batchSize: 25 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("notification_worker_failed", { message: error?.message });
    return NextResponse.json({ ok: false, error: "Falha ao processar a fila de notificações." }, { status: 500 });
  }
}
