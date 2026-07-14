import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = request.headers.get("authorization") || "";

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.rpc("expirar_pedidos_loja");
  if (error) {
    console.error("Falha ao expirar reservas da lojinha:", error.message);
    return NextResponse.json({ ok: false, error: "Falha ao processar reservas." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expiredOrders: Number(data || 0), processedAt: new Date().toISOString() });
}
