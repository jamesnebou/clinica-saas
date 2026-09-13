"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { isInternalAdminUser } from "@/lib/auth/session";
import { safeInternalNext } from "@/lib/auth/self-service.mjs";
import { ensureDemoAccountAndReset, isDemoLoginEmail, isDemoPassword } from "@/lib/demo/demo-account";
import { isInternalAdminEmail } from "@/lib/saas/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTrustedAppOrigin } from "@/lib/security/app-origin";
import { consumePublicRateLimit } from "@/lib/security/public-antiabuse";
import { looksLikeAutomatedForm, validPublicForm } from "@/lib/security/public-antiabuse-core.mjs";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function getBaseUrl() {
  return getTrustedAppOrigin();
}

function createPasswordRecoveryClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Variaveis publicas do Supabase nao configuradas.");
  }

  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "implicit",
      persistSession: false,
    },
  });
}

async function findInternalAdminByEmail(email) {
  if (!email) return null;

  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;

    const user = data?.users?.find((item) => normalizeEmail(item.email) === email);
    if (user) return isInternalAdminUser(user) ? user : null;
    if (!data?.users?.length || data.users.length < 100) break;
    page += 1;
  }

  return null;
}

export async function signInAction(_prevState, formData) {
  if (!validPublicForm(formData)) return { ok: false, message: "Dados inválidos." };
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") || "");
  const mode = String(formData.get("mode") || "cliente");
  const next = safeInternalNext(formData.get("next"), mode === "admin" ? "/dashboard-admin" : "/dashboard");

  if (!email || !password) {
    return { ok: false, message: "Informe e-mail e senha." };
  }

  if (looksLikeAutomatedForm(formData)) return { ok: false, message: "E-mail ou senha inválidos." };
  const loginRateLimit = await consumePublicRateLimit({ scope: "login", headers: await headers(), target: email });
  if (!loginRateLimit.allowed) {
    return { ok: false, message: "Muitas tentativas. Aguarde alguns instantes e tente novamente." };
  }

  if (isDemoLoginEmail(email) && isDemoPassword(password)) {
    try {
      await ensureDemoAccountAndReset();
    } catch {
      console.error("demo_login_prepare_failed");
      return { ok: false, message: "Não foi possível preparar a demonstração agora. Tente novamente em alguns instantes." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, message: "E-mail ou senha inválidos." };
  }

  if (mode === "admin") {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!isInternalAdminUser(user)) {
      await supabase.auth.signOut();
      return { ok: false, message: "Este e-mail não está autorizado no painel administrativo interno." };
    }
  }

  if (mode !== "admin" && isInternalAdminEmail(email)) {
    await supabase.auth.signOut();
    return { ok: false, message: "Use a entrada administrativa para acessar este e-mail." };
  }

  redirect(next);
}

export async function requestAdminPasswordResetAction(_prevState, formData) {
  if (!validPublicForm(formData)) return { ok: false, message: "Dados inválidos." };
  const email = normalizeEmail(formData.get("email"));

  if (!email) {
    return { ok: false, message: "Informe o e-mail administrativo." };
  }

  const genericSuccess = { ok: true, message: "Se este e-mail for um administrador interno, enviaremos um link para redefinir a senha." };
  if (looksLikeAutomatedForm(formData)) return genericSuccess;
  const rateLimit = await consumePublicRateLimit({ scope: "password_recovery", headers: await headers(), target: email });
  if (!rateLimit.allowed) return { ok: false, message: "Muitas tentativas. Aguarde alguns instantes e tente novamente." };

  try {
    const user = await findInternalAdminByEmail(email);

    if (user) {
      const supabase = createPasswordRecoveryClient();
      const baseUrl = await getBaseUrl();
      const redirectTo = `${baseUrl}/auth/recovery?next=/login/nova-senha`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    }

    return genericSuccess;
  } catch {
    console.error("admin_password_recovery_failed");
    return genericSuccess;
  }
}

export async function requestClientPasswordResetAction(_prevState, formData) {
  if (!validPublicForm(formData)) return { ok: false, message: "Dados inválidos." };
  const email = normalizeEmail(formData.get("email"));

  if (!email) return { ok: false, message: "Informe seu e-mail." };

  const genericSuccess = { ok: true, message: "Se este e-mail possuir uma conta de clínica, enviaremos um link para redefinir a senha." };
  if (looksLikeAutomatedForm(formData)) return genericSuccess;
  const rateLimit = await consumePublicRateLimit({ scope: "password_recovery", headers: await headers(), target: email });
  if (!rateLimit.allowed) return { ok: false, message: "Muitas tentativas. Aguarde alguns instantes e tente novamente." };

  try {
    if (!isInternalAdminEmail(email) && !isDemoLoginEmail(email)) {
      const supabase = createPasswordRecoveryClient();
      const baseUrl = await getBaseUrl();
      const redirectTo = `${baseUrl}/auth/recovery?next=/login-cliente/nova-senha`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    }

    return genericSuccess;
  } catch {
    console.error("client_password_recovery_failed");
    return genericSuccess;
  }
}

export async function updateRecoveredPasswordAction(_prevState, formData) {
  if (!validPublicForm(formData)) return { ok: false, message: "Dados inválidos." };
  const password = String(formData.get("password") || "");
  const passwordConfirm = String(formData.get("password_confirm") || "");

  if (password.length < 8) {
    return { ok: false, message: "A nova senha precisa ter pelo menos 8 caracteres." };
  }

  if (password !== passwordConfirm) {
    return { ok: false, message: "A confirmação da senha não confere." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isInternalAdminUser(user)) {
    await supabase.auth.signOut();
    return { ok: false, message: "O link não abriu uma sessão administrativa válida. Solicite um novo link." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, message: "Não foi possível atualizar a senha. Solicite um novo link e tente novamente." };
  }

  await supabase.auth.signOut();
  redirect("/login?senha=alterada");
}

export async function updateClientRecoveredPasswordAction(_prevState, formData) {
  if (!validPublicForm(formData)) return { ok: false, message: "Dados inválidos." };
  const password = String(formData.get("password") || "");
  const passwordConfirm = String(formData.get("password_confirm") || "");

  if (password.length < 8) return { ok: false, message: "A nova senha precisa ter pelo menos 8 caracteres." };
  if (password !== passwordConfirm) return { ok: false, message: "A confirmação da senha não confere." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user || null;

  if (!user || isInternalAdminUser(user) || isDemoLoginEmail(user.email)) {
    if (user) await supabase.auth.signOut();
    return { ok: false, message: "O link não abriu uma sessão de cliente válida. Solicite um novo link." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: "Não foi possível atualizar a senha. Solicite um novo link e tente novamente." };

  await supabase.auth.signOut();
  redirect("/login-cliente?senha=alterada");
}

export async function signOutAction(formData) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(safeInternalNext(formData?.get?.("next"), "/login-cliente"));
}
