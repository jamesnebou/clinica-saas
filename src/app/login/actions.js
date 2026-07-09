"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isInternalAdminUser } from "@/lib/auth/session";
import { ensureDemoAccountAndReset, isDemoLoginEmail, isDemoPassword, resetDemoClinicData } from "@/lib/demo/demo-account";
import { isInternalAdminEmail } from "@/lib/saas/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function safeNext(value, fallback) {
  const next = String(value || "").trim();
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function getBaseUrl() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${protocol}://${host}` : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
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
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") || "");
  const mode = String(formData.get("mode") || "cliente");
  const next = safeNext(formData.get("next"), mode === "admin" ? "/dashboard-admin" : "/dashboard");

  if (!email || !password) {
    return { ok: false, message: "Informe e-mail e senha." };
  }

  if (isDemoLoginEmail(email) && isDemoPassword(password)) {
    try {
      await ensureDemoAccountAndReset();
    } catch (error) {
      console.error("Erro ao preparar conta demo:", error);
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
  const email = normalizeEmail(formData.get("email"));

  if (!email) {
    return { ok: false, message: "Informe o e-mail administrativo." };
  }

  try {
    const user = await findInternalAdminByEmail(email);

    if (user) {
      const supabase = await createClient();
      const baseUrl = await getBaseUrl();
      const redirectTo = `${baseUrl}/auth/callback?next=/login/nova-senha`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    }

    return {
      ok: true,
      message: "Se este e-mail for um administrador interno, enviaremos um link para redefinir a senha.",
    };
  } catch (error) {
    console.error("Erro ao solicitar recuperação de senha admin:", error);
    return { ok: false, message: "Não foi possível enviar o link agora. Confira as configurações de Auth do Supabase e tente novamente." };
  }
}

export async function updateRecoveredPasswordAction(_prevState, formData) {
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

export async function signOutAction(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut();

  if (isDemoLoginEmail(user?.email)) {
    try {
      await resetDemoClinicData();
    } catch (error) {
      console.error("Erro ao restaurar conta demo no logout:", error);
    }
  }

  redirect(safeNext(formData?.get?.("next"), "/login-cliente"));
}
