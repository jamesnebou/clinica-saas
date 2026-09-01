"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_EMAIL } from "@/lib/demo/demo-account";
import {
  buildSelfServiceUserMetadata,
  friendlySignupError,
  validateSelfServiceSignup,
} from "@/lib/auth/self-service.mjs";
import { parseInternalAdminEmails } from "@/lib/saas/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cleanText, normalizeMarketingAttribution } from "@/lib/tracking/core.mjs";
import { getTrustedAppOrigin } from "@/lib/security/app-origin";

const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MINUTES = 10;

function parseAttribution(value) {
  try {
    return normalizeMarketingAttribution(JSON.parse(String(value || "{}")));
  } catch {
    return {};
  }
}

async function requestContext() {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headerStore.get("x-real-ip") || "unknown";
  const salt = process.env.SIGNUP_HASH_SALT || process.env.LEAD_HASH_SALT || process.env.CLINIC_SECRETS_KEY || "nexawi-clinicas-public-signup";
  return {
    baseUrl: await getTrustedAppOrigin(),
    ipHash: createHash("sha256").update(`${salt}:${ip}`).digest("hex"),
    userAgent: cleanText(headerStore.get("user-agent"), 300),
  };
}

async function isRateLimited(ipHash) {
  const since = new Date(Date.now() - SIGNUP_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("clinica_marketing_eventos")
    .select("id", { count: "exact", head: true })
    .eq("event_name", "signup_started")
    .eq("ip_hash", ipHash)
    .gte("created_at", since);

  if (error) {
    console.error("self_service_signup_rate_limit_unavailable", { code: error.code || "unknown" });
    return false;
  }
  return (count || 0) >= SIGNUP_LIMIT;
}

async function recordSignupEvent({ eventName, ipHash, attribution, sessionId, selectedPlan, userAgent, authUserId = null }) {
  const { error } = await supabaseAdmin.from("clinica_marketing_eventos").insert({
    event_name: eventName,
    session_id: cleanText(sessionId, 100),
    pagina: "/cadastro",
    referrer: attribution.first_referrer || attribution.last_touch?.referrer || null,
    utm_source: attribution.utm_source || null,
    utm_medium: attribution.utm_medium || null,
    utm_campaign: attribution.utm_campaign || null,
    utm_content: attribution.utm_content || null,
    utm_term: attribution.utm_term || null,
    ip_hash: ipHash,
    metadata: {
      selected_plan: selectedPlan,
      signup_source: "self_service",
      user_agent: userAgent,
      ...(authUserId ? { auth_user_id: authUserId } : {}),
    },
  });
  if (error) console.error("self_service_signup_event_failed", { eventName, code: error.code || "unknown" });
}

export async function signUpAction(_previousState, formData) {
  if (String(formData.get("website") || "").trim()) {
    return { ok: true, message: "Cadastro recebido." };
  }

  const validation = validateSelfServiceSignup({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    passwordConfirm: formData.get("password_confirm"),
    acceptedTerms: formData.get("terms"),
    selectedPlan: formData.get("selected_plan"),
  }, {
    demoEmail: DEMO_EMAIL,
    internalAdminEmails: parseInternalAdminEmails(),
  });

  if (!validation.ok) return validation;

  const { name, email, phone, password, selectedPlan } = validation.value;
  const attribution = parseAttribution(formData.get("marketing_attribution"));
  const sessionId = cleanText(formData.get("marketing_session_id"), 100);
  const context = await requestContext();

  if (await isRateLimited(context.ipHash)) {
    return { ok: false, message: "Muitas tentativas foram realizadas. Aguarde alguns minutos e tente novamente." };
  }

  await recordSignupEvent({
    eventName: "signup_started",
    ipHash: context.ipHash,
    attribution,
    sessionId,
    selectedPlan,
    userAgent: context.userAgent,
  });

  const supabase = await createClient();
  const onboardingPath = `/onboarding?plan=${encodeURIComponent(selectedPlan)}`;
  const emailRedirectTo = `${context.baseUrl}/auth/callback?next=${encodeURIComponent(onboardingPath)}`;
  const metadata = {
    ...buildSelfServiceUserMetadata({ name, phone, selectedPlan }),
    marketing_attribution: attribution,
    marketing_session_id: sessionId,
  };
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata, emailRedirectTo },
  });

  if (error) {
    console.error("self_service_signup_failed", {
      name: error?.name || null,
      code: error?.code || null,
      status: error?.status || null,
      message: error?.message || null,
    });
    return { ok: false, message: friendlySignupError(error) };
  }

  await recordSignupEvent({
    eventName: "signup_completed",
    ipHash: context.ipHash,
    attribution,
    sessionId,
    selectedPlan,
    userAgent: context.userAgent,
    authUserId: data.user?.id || null,
  });

  if (data.session) redirect(onboardingPath);

  return {
    ok: true,
    requiresEmailConfirmation: true,
    message: "Conta criada. Abra o e-mail de confirmação para continuar o cadastro da sua clínica.",
  };
}
