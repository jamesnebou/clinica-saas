import { NextResponse } from "next/server";
import { safeInternalNext } from "@/lib/auth/self-service.mjs";
import { createClient } from "@/lib/supabase/server";
import { consumePublicRateLimit, noStoreJson, publicRateLimitResponse } from "@/lib/security/public-antiabuse";

export async function GET(request) {
  if (request.url.length > 4096) return noStoreJson({ ok: false }, { status: 414 });
  const rateLimit = await consumePublicRateLimit({ scope: "auth_exchange", headers: request.headers });
  if (!rateLimit.allowed) return publicRateLimitResponse(rateLimit);
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
