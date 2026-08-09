import { NextResponse } from "next/server";
import { DEMO_EMAIL, DEMO_PASSWORD, ensureDemoAccountAndReset } from "@/lib/demo/demo-account";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  try {
    await ensureDemoAccountAndReset();
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (error) throw error;

    await supabaseAdmin.from("clinica_marketing_eventos").insert({
      event_name: "demo_access",
      pagina: "/demo",
      metadata: { automatic_login: true },
    });

    return NextResponse.redirect(new URL("/dashboard?tour=1", request.url));
  } catch (error) {
    console.error("Erro ao preparar acesso automático da demo:", error);
    return NextResponse.redirect(new URL("/login-cliente?erro=demo", request.url));
  }
}
