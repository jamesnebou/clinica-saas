import { NextResponse } from "next/server";
import { safeInternalNext } from "@/lib/auth/self-service.mjs";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeInternalNext(requestUrl.searchParams.get("next"), "/login");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const errorPath = next.startsWith("/login/") ? "/login/recuperar-senha?erro=link" : "/login-cliente?erro=link";
      return NextResponse.redirect(new URL(errorPath, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
