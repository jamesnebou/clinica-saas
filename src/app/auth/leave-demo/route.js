import { NextResponse } from "next/server";
import { getUserClinics } from "@/lib/auth/session";
import { isDemoLoginEmail } from "@/lib/demo/demo-account";
import { safeInternalNext } from "@/lib/auth/self-service.mjs";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const next = safeInternalNext(requestUrl.searchParams.get("next"), "/cadastro");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user || null;

  if (user && isDemoLoginEmail(user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  if (user) {
    const { activeClinic } = await getUserClinics();
    return NextResponse.redirect(new URL(activeClinic ? "/dashboard" : "/onboarding", requestUrl.origin));
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
