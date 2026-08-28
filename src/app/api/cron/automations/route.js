import { NextResponse } from "next/server";
import { runAutomationWorker } from "@/lib/automations/scheduler";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try { return NextResponse.json(await runAutomationWorker({ batchSize: 25 })); }
  catch (error) { console.error("Automation worker failed:", error); return NextResponse.json({ error: "Falha ao processar automações." }, { status: 500 }); }
}

export const POST = GET;
