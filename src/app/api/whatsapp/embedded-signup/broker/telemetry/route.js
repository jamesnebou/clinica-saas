import { NextResponse } from "next/server";
import { getRequestOrigin, isMetaConnectRequestOrigin } from "@/lib/whatsapp/broker";
import { normalizeBrokerTelemetryPayload } from "@/lib/whatsapp/broker-client-core.mjs";
import { getEmbeddedSignupBrokerSession } from "@/lib/whatsapp/onboarding";
import { sanitizeMetaError } from "@/lib/whatsapp/meta/errors";

export const runtime = "nodejs";

function reject(status) {
  return NextResponse.json({ ok: false }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request) {
  try {
    const requestOrigin = getRequestOrigin(request);
    const suppliedOrigin = request.headers.get("origin");
    if (!isMetaConnectRequestOrigin(requestOrigin) || !isMetaConnectRequestOrigin(suppliedOrigin)) {
      return reject(403);
    }

    const telemetry = normalizeBrokerTelemetryPayload(await request.json());
    if (!telemetry) return reject(400);

    const session = await getEmbeddedSignupBrokerSession({ state: telemetry.state });
    console.info("meta_embedded_signup_telemetry", {
      session_id: session.sessionId,
      ...telemetry.log,
    });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("meta_embedded_signup_telemetry_failed", {
      name: error?.name || null,
      code: error?.code || null,
      status: error?.status || null,
      message: sanitizeMetaError(error),
    });
    return reject(400);
  }
}
