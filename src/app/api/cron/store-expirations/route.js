import { NextResponse } from "next/server";
import { cronUnauthorizedResponse, isCronRequestAuthorized } from "@/lib/cron/auth";
import { workerHttpResult } from "@/lib/cron/result.mjs";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  if (!isCronRequestAuthorized(request)) return cronUnauthorizedResponse();

  const { data, error } = await supabaseAdmin.rpc("expirar_pedidos_loja");
  if (error) {
    console.error("store_expirations_worker_failed", { code: error.code || "unknown" });
    return NextResponse.json({ ok: false, error: "Falha ao processar reservas." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const expiredOrders = Number(data || 0);
  const response = workerHttpResult({ processed: expiredOrders, succeeded: expiredOrders, skipped: 0, retryScheduled: 0, failed: 0, dead: 0, expiredOrders, processedAt: new Date().toISOString() });
  return NextResponse.json(response.body, { status: response.status, headers: { "Cache-Control": "no-store" } });
}
