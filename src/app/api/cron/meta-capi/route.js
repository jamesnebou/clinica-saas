import { NextResponse } from "next/server";
import { isTrackingCronAuthorized } from "@/lib/tracking/cron-auth.mjs";
import { processPendingMetaConversionEvents } from "@/lib/tracking/service";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request) {
  return isTrackingCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET);
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await processPendingMetaConversionEvents({ batchSize: 25 });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("meta_capi_worker_failed", { code: error?.code || "unknown" });
    return NextResponse.json({ ok: false, error: "Falha ao processar eventos da Meta." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export const POST = GET;
