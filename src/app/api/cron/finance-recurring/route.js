import { NextResponse } from "next/server";
import { cronUnauthorizedResponse, isCronRequestAuthorized } from "@/lib/cron/auth";
import { workerHttpResult } from "@/lib/cron/result.mjs";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  if (!isCronRequestAuthorized(request)) return cronUnauthorizedResponse();
  try {
    const { data, error } = await supabaseAdmin.rpc("finance_gerar_recorrencias", { p_ate: new Date().toISOString().slice(0, 10) });
    if (error) throw error;
    const generated = Number(data || 0);
    const response = workerHttpResult({ processed: generated, succeeded: generated, skipped: 0, retryScheduled: 0, failed: 0, dead: 0, generated });
    return NextResponse.json(response.body, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("finance_recurring_worker_failed", { code: error?.code || "unknown" });
    return NextResponse.json({ ok: false, error: "Falha ao gerar recorrências financeiras." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
