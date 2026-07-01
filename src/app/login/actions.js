"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureDemoAccountAndReset, isDemoLoginEmail, isDemoPassword, resetDemoClinicData } from "@/lib/demo/demo-account";
import { isInternalAdminEmail } from "@/lib/saas/plans";

function safeNext(value, fallback) {
  const next = String(value || "").trim();
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

export async function signInAction(_prevState, formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const mode = String(formData.get("mode") || "cliente");
  const next = safeNext(formData.get("next"), mode === "admin" ? "/admin" : "/dashboard");

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

  if (mode === "admin" && !isInternalAdminEmail(email)) {
    await supabase.auth.signOut();
    return { ok: false, message: "Este e-mail nao esta autorizado no painel administrativo interno." };
  }

  redirect(next);
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
