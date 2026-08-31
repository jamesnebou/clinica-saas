import { safeTokenEquals } from "../whatsapp/core.mjs";

export function isTrackingCronAuthorized(authorization, secret) {
  const expected = String(secret || "").trim();
  if (!expected) return false;
  return safeTokenEquals(String(authorization || ""), `Bearer ${expected}`);
}
