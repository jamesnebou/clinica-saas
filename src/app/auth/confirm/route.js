import { NextResponse } from "next/server";
import { buildSignupConfirmationDestination } from "@/lib/auth/self-service.mjs";
import { getTrustedAppOrigin } from "@/lib/security/app-origin";
import { createClient } from "@/lib/supabase/server";

const CONFIRMATION_ERROR_PATH = "/login-cliente?erro=confirmacao";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const tokenHash = String(requestUrl.searchParams.get("token_hash") || "").trim();
  const type = requestUrl.searchParams.get("type");
  const trustedOrigin = await getTrustedAppOrigin();

  if (!tokenHash || tokenHash.length > 512 || type !== "email") {
    return NextResponse.redirect(new URL(CONFIRMATION_ERROR_PATH, trustedOrigin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });

  if (error || !data.user) {
    return NextResponse.redirect(new URL(CONFIRMATION_ERROR_PATH, trustedOrigin));
  }

  const destination = buildSignupConfirmationDestination(
    requestUrl.searchParams.get("redirect_to"),
    trustedOrigin,
    data.user.user_metadata?.selected_plan,
  );
  return NextResponse.redirect(new URL(destination, trustedOrigin));
}
