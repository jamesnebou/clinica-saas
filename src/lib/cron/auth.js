import "server-only";

import { NextResponse } from "next/server";
import { isCronAuthorizationValid } from "./auth-core.mjs";

const NO_STORE_HEADERS = Object.freeze({ "Cache-Control": "no-store" });

export function isCronRequestAuthorized(request) {
  return isCronAuthorizationValid(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
  );
}

export function cronUnauthorizedResponse() {
  return NextResponse.json(
    { ok: false, error: "Não autorizado." },
    { status: 401, headers: NO_STORE_HEADERS },
  );
}
