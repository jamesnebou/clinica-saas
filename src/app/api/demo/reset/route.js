import { NextResponse } from "next/server";
import { isDemoLoginEmail, resetDemoClinicData } from "@/lib/demo/demo-account";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isDemoLoginEmail(user.email)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  try {
    await resetDemoClinicData();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao restaurar a demonstração:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
