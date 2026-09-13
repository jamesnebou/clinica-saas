import { NextResponse } from "next/server";
import { supabaseAdmin } from "../supabase/admin.js";
import { publicRateLimitResponseDescriptor } from "./public-antiabuse-core.mjs";
import {
  consumePublicRateLimitRuntime,
  hashPublicRateLimitValue,
  publicRequestFingerprint,
  trustedPublicRequestIp,
} from "./public-antiabuse-runtime.mjs";

export { hashPublicRateLimitValue, publicRequestFingerprint, trustedPublicRequestIp };

export function consumePublicRateLimit(input) {
  return consumePublicRateLimitRuntime({ ...input, supabase: input.supabase || supabaseAdmin });
}

export function publicRateLimitResponse(result) {
  const descriptor = publicRateLimitResponseDescriptor(result);
  return NextResponse.json(descriptor.body, { status: descriptor.status, headers: descriptor.headers });
}

export function noStoreJson(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(payload, { ...init, headers });
}
