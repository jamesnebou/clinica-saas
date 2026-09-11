import { createHash, timingSafeEqual } from "node:crypto";

function digest(value) {
  return createHash("sha256").update(String(value || "")).digest();
}

export function isCronAuthorizationValid(authorization, secret) {
  const configuredSecret = typeof secret === "string" ? secret : "";
  if (!configuredSecret.trim()) return false;

  return timingSafeEqual(
    digest(authorization),
    digest(`Bearer ${configuredSecret}`),
  );
}
