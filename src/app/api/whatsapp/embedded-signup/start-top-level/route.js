import { NextResponse } from "next/server";
import { requireClinicSection } from "@/lib/auth/session";
import { getCurrentMembership } from "@/lib/auth/permissions";
import { createEmbeddedSignupSession } from "@/lib/whatsapp/onboarding";
import { getMetaConnectOrigin, getRequestOrigin } from "@/lib/whatsapp/broker";
import { isMetaConfigured } from "@/lib/whatsapp/meta/client";
import { sanitizeMetaError } from "@/lib/whatsapp/meta/errors";
import { isSafeTopLevelPost, META_BROKER_NAVIGATION_TOP_LEVEL } from "@/lib/whatsapp/broker-core.mjs";

export const runtime = "nodejs";

function errorPage(status = 400) {
  return new Response(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar WhatsApp | NexaWi</title>
<style>body{margin:0;background:#f5f5f4;color:#171717;font-family:Arial,sans-serif}.page{min-height:100vh;display:grid;place-items:center;padding:20px}.panel{width:min(100%,420px);box-sizing:border-box;border:1px solid #e5e5e5;border-radius:8px;background:#fff;padding:24px}.brand{color:#ea580c;font-size:12px;font-weight:800;text-transform:uppercase}.title{font-size:24px;margin:14px 0 8px}.copy{color:#525252;line-height:1.55}.button{display:flex;height:46px;align-items:center;justify-content:center;margin-top:20px;border-radius:8px;background:#171717;color:#fff;font-weight:700;text-decoration:none}</style>
</head><body><main class="page"><section class="panel"><p class="brand">NexaWi Clínicas</p><h1 class="title">Não foi possível iniciar a conexão.</h1><p class="copy">Volte para a clínica e tente novamente.</p><a class="button" href="/dashboard/whatsapp?tab=conexao">Voltar para a clínica</a></section></main></body></html>`, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request) {
  const requestOrigin = getRequestOrigin(request);
  try {
    if (!isSafeTopLevelPost({
      requestOrigin,
      originHeader: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    })) {
      throw new Error("Origem do início top-level inválida.");
    }

    const context = await requireClinicSection("whatsapp");
    const membership = getCurrentMembership(context.memberships, context.activeClinic.id);
    if (!["owner", "admin"].includes(membership?.papel)) return errorPage(403);
    if (!isMetaConfigured()) return errorPage(503);

    const result = await createEmbeddedSignupSession({
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      role: membership.papel,
      requestOrigin,
      navigationMode: META_BROKER_NAVIGATION_TOP_LEVEL,
    });
    const brokerUrl = new URL(result.brokerUrl || "https://invalid.local");
    if (result.mode !== "broker" || brokerUrl.origin !== getMetaConnectOrigin()) {
      throw new Error("Fluxo top-level indisponível para esta clínica.");
    }

    console.info("meta_top_level_signup_started", {
      session_id: result.sessionId,
      clinic_id: context.activeClinic.id,
      navigation_mode: META_BROKER_NAVIGATION_TOP_LEVEL,
      validated_host: new URL(requestOrigin).host,
      mode: result.mode,
      redirect_emitted: true,
    });
    return NextResponse.redirect(brokerUrl, 303);
  } catch (error) {
    console.error("meta_top_level_signup_failed", {
      name: error?.name || null,
      code: error?.code || null,
      status: error?.status || null,
      message: sanitizeMetaError(error) || "Não foi possível iniciar a conexão.",
    });
    return errorPage(400);
  }
}
