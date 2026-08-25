import { NextResponse } from "next/server";
import { requireClinicSection } from "@/lib/auth/session";
import { getCurrentMembership } from "@/lib/auth/permissions";
import { completeEmbeddedSignup } from "@/lib/whatsapp/onboarding";

export const runtime = "nodejs";
export async function POST(request) {
  try {
    const context = await requireClinicSection("whatsapp"); const membership = getCurrentMembership(context.memberships, context.activeClinic.id);
    if (!["owner","admin"].includes(membership?.papel)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const body = await request.json();
    for (const key of ["state","code","wabaId","phoneNumberId"]) if (!String(body?.[key] || "").trim()) return NextResponse.json({ error: "Retorno incompleto da Meta." }, { status: 400 });
    const result = await completeEmbeddedSignup({ ...body, clinicId: context.activeClinic.id, userId: context.user.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { return NextResponse.json({ error: error?.message || "Não foi possível concluir a conexão." }, { status: 400 }); }
}

