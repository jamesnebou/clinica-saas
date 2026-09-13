import { NextResponse } from "next/server";
import { isDemoLoginEmail, resetDemoClinicData } from "@/lib/demo/demo-account";
import { createClient } from "@/lib/supabase/server";
import { consumePublicRateLimit, publicRateLimitResponse } from "@/lib/security/public-antiabuse";

export async function POST(request) {
  const rateLimit = await consumePublicRateLimit({ scope: "demo_access", headers: request.headers });
  if (!rateLimit.allowed) return publicRateLimitResponse(rateLimit);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isDemoLoginEmail(user.email)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  try {
    await resetDemoClinicData();
    return NextResponse.json({ ok: true });
  } catch {
    console.error("demo_reset_failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
