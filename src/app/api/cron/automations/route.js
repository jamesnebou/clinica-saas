import { NextResponse } from "next/server";
import { runAutomationWorker } from "@/lib/automations/scheduler";
import { isAutomationCronAuthorized } from "@/lib/automations/cron-auth.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request) {
  return isAutomationCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET);
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await runAutomationWorker({ batchSize: 25 });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("automation_worker_failed", { code: error?.code, message: error?.message });
    return NextResponse.json({ ok: false, error: "Falha ao processar automações." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export const POST = GET;
