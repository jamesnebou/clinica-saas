const DEFAULT_PLAN = "starter";
const KNOWN_PLAN_SLUGS = new Set(["starter", "growth", "premium", "ilimitado"]);

export function normalizeSignupEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 320);
}

export function normalizeSignupPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  if (!/^[1-9]{2}9?\d{8}$/.test(digits)) return null;
  return `55${digits}`;
}

export function normalizeSelectedPlan(value, fallback = DEFAULT_PLAN) {
  const normalized = String(value || "").trim().toLowerCase();
  return KNOWN_PLAN_SLUGS.has(normalized) ? normalized : fallback;
}

export function safeInternalNext(value, fallback = "/") {
  const next = String(value || "").trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) {
    return fallback;
  }

  try {
    const parsed = new URL(next, "https://nexawi.invalid");
    if (parsed.origin !== "https://nexawi.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function validateSelfServiceSignup(input = {}, { demoEmail = "", internalAdminEmails = [] } = {}) {
  const name = String(input.name || "").trim().replace(/\s+/g, " ").slice(0, 120);
  const email = normalizeSignupEmail(input.email);
  const phone = normalizeSignupPhone(input.phone);
  const password = String(input.password || "");
  const passwordConfirm = String(input.passwordConfirm || "");
  const acceptedTerms = input.acceptedTerms === true || input.acceptedTerms === "on";
  const reservedEmails = new Set([
    normalizeSignupEmail(demoEmail),
    ...internalAdminEmails.map(normalizeSignupEmail),
  ].filter(Boolean));

  if (name.length < 3) return { ok: false, message: "Informe seu nome completo." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Informe um e-mail válido." };
  if (!phone) return { ok: false, message: "Informe um WhatsApp brasileiro válido com DDD." };
  if (password.length < 8) return { ok: false, message: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== passwordConfirm) return { ok: false, message: "A confirmação da senha não confere." };
  if (!acceptedTerms) return { ok: false, message: "Aceite os Termos de Uso e a Política de Privacidade para continuar." };
  if (reservedEmails.has(email)) return { ok: false, message: "Este e-mail não pode ser usado no cadastro público." };

  return {
    ok: true,
    value: {
      name,
      email,
      phone,
      password,
      selectedPlan: normalizeSelectedPlan(input.selectedPlan),
    },
  };
}

export function buildSelfServiceUserMetadata({ name, phone, selectedPlan }) {
  return {
    name: String(name || "").trim().slice(0, 120),
    phone: normalizeSignupPhone(phone),
    signup_source: "self_service",
    selected_plan: normalizeSelectedPlan(selectedPlan),
  };
}

export function friendlySignupError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  if (code.includes("over_email_send_rate_limit") || message.includes("rate limit")) {
    return "Muitas tentativas foram realizadas. Aguarde alguns minutos e tente novamente.";
  }
  if (code.includes("weak_password") || message.includes("password")) {
    return "A senha não atende aos requisitos de segurança. Use pelo menos 8 caracteres.";
  }
  if (code.includes("user_already_exists") || message.includes("already registered") || message.includes("already exists")) {
    return "Este e-mail já pode possuir uma conta. Tente entrar ou recuperar sua senha.";
  }
  return "Não foi possível criar sua conta agora. Confira os dados e tente novamente.";
}
