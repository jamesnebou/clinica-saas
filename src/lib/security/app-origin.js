import "server-only";

import { headers } from "next/headers";
import { resolveTrustedAppOrigin } from "./origin-core.mjs";

export async function getTrustedAppOrigin() {
  const headerStore = await headers();
  return resolveTrustedAppOrigin({
    configured: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL,
    host: headerStore.get("x-forwarded-host") || headerStore.get("host"),
    protocol: headerStore.get("x-forwarded-proto"),
    nodeEnv: process.env.NODE_ENV,
  });
}
