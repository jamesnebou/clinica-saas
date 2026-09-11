import { NextResponse } from "next/server";
import { cronUnauthorizedResponse, isCronRequestAuthorized } from "@/lib/cron/auth";
import { workerHttpResult } from "@/lib/cron/result.mjs";
import { processPendingMetaConversionEvents } from "@/lib/tracking/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  if (!isCronRequestAuthorized(request)) return cronUnauthorizedResponse();

  try {
    const result = await processPendingMetaConversionEvents({ batchSize: 25 });
    const response = workerHttpResult(result);
    return NextResponse.json(response.body, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("meta_capi_worker_failed", { code: error?.code || "unknown" });
    return NextResponse.json({ ok: false, error: "Falha ao processar eventos da Meta." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export const POST = GET;
