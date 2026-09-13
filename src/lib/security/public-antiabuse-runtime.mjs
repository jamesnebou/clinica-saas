import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { publicRateLimitPolicy } from "./public-antiabuse-core.mjs";

function rateLimitSecret() {
  const secret = process.env.PUBLIC_RATE_LIMIT_SECRET
    || process.env.LEAD_HASH_SALT
    || process.env.SIGNUP_HASH_SALT
    || process.env.CLINIC_SECRETS_KEY;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "nexawi-local-public-rate-limit";
  throw new Error("PUBLIC_RATE_LIMIT_SECRET_NOT_CONFIGURED");
}

function normalizeIpCandidate(value) {
  let candidate = String(value || "").trim();
  if (!candidate) return null;
  if (candidate.startsWith("[") && candidate.includes("]")) candidate = candidate.slice(1, candidate.indexOf("]"));
  if (isIP(candidate)) return candidate;
  const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)?.[1];
  return ipv4WithPort && isIP(ipv4WithPort) ? ipv4WithPort : null;
}

export function trustedPublicRequestIp(headerStore) {
  // Trust only the header replaced by the hosting platform, never client hints.
  if (process.env.VERCEL === "1") {
    return normalizeIpCandidate(headerStore?.get?.("x-vercel-forwarded-for"))
      || normalizeIpCandidate(headerStore?.get?.("x-forwarded-for")) || "unknown";
  }
  // A self-hosted deployment must explicitly attest that its ingress overwrites XFF.
  if (process.env.PUBLIC_RATE_LIMIT_TRUST_PROXY === "1" || process.env.NODE_ENV === "test") {
    return normalizeIpCandidate(headerStore?.get?.("x-forwarded-for")) || "unknown";
  }
  return "unknown";
}

export function hashPublicRateLimitValue(kind, value) {
  return createHmac("sha256", rateLimitSecret())
    .update(`${String(kind || "subject")}:${String(value || "unknown")}`)
    .digest("hex");
}

export function publicRequestFingerprint(headerStore) {
  const ip = trustedPublicRequestIp(headerStore);
  let normalized = ip.toLowerCase();
  if (isIP(ip) === 6) {
    const canonical = new URL(`http://[${ip}]`).hostname.slice(1, -1);
    const [left, right = ""] = canonical.split("::");
    const head = left ? left.split(":") : [];
    const tail = right ? right.split(":") : [];
    const words = [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail].map((part) => parseInt(part, 16));
    normalized = words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 65535
      ? [words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255].join(".")
      : words.slice(0, 4).map((word) => word.toString(16)).join(":") + "::/64";
  }
  return hashPublicRateLimitValue("ip", normalized);
}

async function consumeBucket({ supabase, scope, tenantKey, subjectHash, limit, windowSeconds }) {
  const { data, error } = await supabase.rpc("consume_public_rate_limit", {
    p_scope: scope,
    p_tenant_key: tenantKey,
    p_subject_hash: subjectHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function consumePublicRateLimitRuntime({ scope, headers, tenantId = null, target = null, supabase }) {
  const policy = publicRateLimitPolicy(scope);
  const tenantKey = tenantId ? String(tenantId).slice(0, 100) : "global";
  try {
  const subjects = [{
    scope: `${scope}:ip`,
    hash: publicRequestFingerprint(headers),
    limit: policy.limit,
  }];
  if (target && policy.targetLimit) {
    subjects.push({
      scope: `${scope}:target`,
      hash: hashPublicRateLimitValue(`${scope}:target`, String(target).trim().toLowerCase()),
      limit: policy.targetLimit,
    });
  }

    let retryAfter = 1;
    for (const subject of subjects) {
      const row = await consumeBucket({
        supabase,
        scope: subject.scope,
        tenantKey,
        subjectHash: subject.hash,
        limit: subject.limit,
        windowSeconds: policy.windowSeconds,
      });
      retryAfter = Math.max(retryAfter, Number(row?.retry_after || 1));
      if (typeof row?.allowed !== "boolean") throw new Error("INVALID_LIMITER_RESPONSE");
      if (!row.allowed) {
        if (Number(row.current_count) === subject.limit + 1) console.warn("public_rate_limit_blocked", { scope });
        return { allowed: false, limited: true, retryAfter };
      }
    }
    return { allowed: true, limited: false, retryAfter: 0 };
  } catch (error) {
    console.error("public_rate_limit_unavailable", { scope, code: /^[A-Z0-9_]{1,40}$/.test(error?.code || "") ? error.code : "unavailable" });
    return {
      allowed: policy.failMode === "open",
      limited: false,
      unavailable: true,
      retryAfter: 30,
    };
  }
}
