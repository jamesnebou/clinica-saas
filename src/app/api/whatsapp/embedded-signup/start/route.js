import { NextResponse } from "next/server";
import { requireClinicSection } from "@/lib/auth/session";
import { getCurrentMembership } from "@/lib/auth/permissions";
import { createEmbeddedSignupSession } from "@/lib/whatsapp/onboarding";
import { isMetaConfigured } from "@/lib/whatsapp/meta/client";
import { getRequestOrigin } from "@/lib/whatsapp/broker";

export const runtime = "nodejs";
export async function POST(request) {
  try {
    const context = await requireClinicSection("whatsapp"); const membership = getCurrentMembership(context.memberships, context.activeClinic.id);
    if (!["owner","admin"].includes(membership?.papel)) return NextResponse.json({ error: "Somente owner ou admin pode conectar o WhatsApp." }, { status: 403 });
    if (!isMetaConfigured()) return NextResponse.json({ error: "WhatsApp Meta ainda não configurado na NexaWi." }, { status: 503 });
    return NextResponse.json(await createEmbeddedSignupSession({
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      role: membership.papel,
      requestOrigin: getRequestOrigin(request),
    }));
  } catch (error) { return NextResponse.json({ error: error?.message || "Não foi possível iniciar a conexão." }, { status: 400 }); }
}
