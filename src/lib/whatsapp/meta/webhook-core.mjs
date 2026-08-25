import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMetaWebhookSignature(rawBody, signature, appSecret) {
  if (!rawBody || !signature || !appSecret || !signature.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
