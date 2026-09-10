import { NextResponse } from "next/server";
import { completeEmbeddedSignupFromBroker, failEmbeddedSignupBrokerSession } from "@/lib/whatsapp/onboarding";
import { getRequestOrigin, isMetaConnectRequestOrigin } from "@/lib/whatsapp/broker";
import { sanitizeMetaError } from "@/lib/whatsapp/meta/errors";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    if (!isMetaConnectRequestOrigin(getRequestOrigin(request))) {
      return NextResponse.json({ error: "Origem de conexão inválida." }, { status: 404 });
    }
    const body = await request.json();
    const state = String(body?.state || "").trim();
    if (!state) return NextResponse.json({ error: "Sessão de conexão inválida." }, { status: 400 });
    if (body?.outcome && body.outcome !== "success") {
      const result = await failEmbeddedSignupBrokerSession({ state, reason: body.outcome });
      return NextResponse.json({ ok: true, sessionId: result.sessionId, status: result.status });
    }
    for (const key of ["code", "wabaId", "phoneNumberId"]) {
      if (!String(body?.[key] || "").trim()) {
        await failEmbeddedSignupBrokerSession({ state, reason: "assets_missing" });
        return NextResponse.json({ error: "A Meta não retornou todos os ativos necessários." }, { status: 400 });
      }
    }
    const result = await completeEmbeddedSignupFromBroker({
      state,
      code: body.code,
      wabaId: body.wabaId,
      phoneNumberId: body.phoneNumberId,
    });
    return NextResponse.json({ ok: true, sessionId: result.sessionId, status: "completed", returnUrl: result.returnUrl });
  } catch (error) {
    return NextResponse.json({ error: sanitizeMetaError(error) || "Não foi possível concluir a conexão." }, { status: 400 });
  }
}
