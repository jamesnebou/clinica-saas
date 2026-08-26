import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || provided !== expected) return NextResponse.json({ ok:false, error:"unauthorized" },{status:401});
  const {data,error}=await supabaseAdmin.rpc("finance_gerar_recorrencias",{p_ate:new Date().toISOString().slice(0,10)});
  if(error) return NextResponse.json({ok:false,error:error.message,code:error.code},{status:500});
  return NextResponse.json({ok:true,generated:Number(data||0)});
}
