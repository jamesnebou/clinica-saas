import { NextResponse } from "next/server";
import { requireClinicSection } from "@/lib/auth/session";
import { getCurrentMembership } from "@/lib/auth/permissions";
import { getEmbeddedSignupSessionStatus } from "@/lib/whatsapp/onboarding";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const context = await requireClinicSection("whatsapp");
    const membership = getCurrentMembership(context.memberships, context.activeClinic.id);
    if (!["owner", "admin"].includes(membership?.papel)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (!sessionId) return NextResponse.json({ error: "Sessão não informada." }, { status: 400 });
    const status = await getEmbeddedSignupSessionStatus({ sessionId, clinicId: context.activeClinic.id, userId: context.user.id });
    if (!status) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar a conexão." }, { status: 400 });
  }
}
