import { NextResponse } from "next/server";
import { cronUnauthorizedResponse, isCronRequestAuthorized } from "@/lib/cron/auth";
import { workerHttpResult } from "@/lib/cron/result.mjs";
import { runNotificationWorker } from "@/lib/whatsapp/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  if (!isCronRequestAuthorized(request)) return cronUnauthorizedResponse();
  try {
    const result = await runNotificationWorker({ workerId: `vercel:${crypto.randomUUID()}`, batchSize: 25 });
    const response = workerHttpResult(result);
    return NextResponse.json(response.body, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("notification_worker_failed", { code: error?.code || "unknown" });
    return NextResponse.json({ ok: false, error: "Falha ao processar a fila de notificações." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
