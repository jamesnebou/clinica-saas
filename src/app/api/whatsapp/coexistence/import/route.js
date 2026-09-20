import { NextResponse } from "next/server";
import { requireClinicSection } from "@/lib/auth/session";
import { getCurrentMembership } from "@/lib/auth/permissions";
import { authorizeCoexistenceImport } from "@/lib/whatsapp/meta/coexistence-import";
import { getRequestOrigin } from "@/lib/whatsapp/broker";

export const runtime = "nodejs";
export async function POST(request) {
  try {
    if (request.headers.get("origin") !== getRequestOrigin(request)) return NextResponse.json({ error: "Origem invalida." }, { status: 403 });
    const context = await requireClinicSection("whatsapp");
    const membership = getCurrentMembership(context.memberships, context.activeClinic.id);
    if (!["owner", "admin"].includes(membership?.papel)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const text = await request.text();
    if (text.length > 512) return NextResponse.json({ error: "Requisicao invalida." }, { status: 400 });
    const body = JSON.parse(text);
    const result = await authorizeCoexistenceImport({
      clinicId: context.activeClinic.id, userId: context.user.id, role: membership.papel, authorized: body.authorizeImport,
    });
    return NextResponse.json({ ok: true, replay: Boolean(result.replay), requests: Object.fromEntries(Object.entries(result.requests || {}).map(([key, value]) => [key, value.status])) });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel solicitar a importacao. Verifique a conexao, a autorizacao e a janela de 24 horas. Mensagens novas nao foram interrompidas." }, { status: 400 });
  }
}
