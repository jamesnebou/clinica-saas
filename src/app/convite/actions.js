"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canAcceptStaffInvitation } from "@/lib/auth/staff-invitation.mjs";
import { assertClinicLimit } from "@/lib/saas/plans";

function invitationId(formData) {
  const id = String(formData.get("id") || "");
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

async function pendingMembership(id) {
  const { data, error } = await supabaseAdmin.from("usuarios_clinica")
    .select("id, clinica_id, user_id, email, ativo, accepted_at, invite_expires_at, invite_requires_password")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function activateMembership(membership, user) {
  if (!canAcceptStaffInvitation(membership, user)) return "invalid";
  const { data: clinic, error: clinicError } = await supabaseAdmin.from("clinicas")
    .select("*").eq("id", membership.clinica_id).maybeSingle();
  if (clinicError) throw clinicError;
  if (!clinic) return "invalid";
  try {
    await assertClinicLimit({ clinic, resource: "usuarios" });
  } catch {
    return "limit";
  }
  const { data, error } = await supabaseAdmin.from("usuarios_clinica")
    .update({ ativo: true, accepted_at: new Date().toISOString(), invite_expires_at: null })
    .eq("id", membership.id).eq("clinica_id", membership.clinica_id)
    .eq("user_id", user.id).eq("ativo", false).is("accepted_at", null)
    .gt("invite_expires_at", new Date().toISOString())
    .select("id").maybeSingle();
  if (error) throw error;
  return data ? "accepted" : "invalid";
}

export async function verifyStaffInvitationAction(formData) {
  const id = invitationId(formData);
  const tokenHash = String(formData.get("token_hash") || "");
  const type = String(formData.get("type") || "");
  if (!id || !tokenHash || tokenHash.length > 512 || !["invite", "magiclink"].includes(type)) redirect("/login-cliente?erro=convite");
  const membership = await pendingMembership(id);
  if (!membership || membership.ativo || membership.accepted_at || new Date(membership.invite_expires_at || "") <= new Date()) {
    redirect("/login-cliente?erro=convite");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !canAcceptStaffInvitation(membership, data?.user)) redirect("/login-cliente?erro=convite");

  if (membership.invite_requires_password) redirect(`/convite/aceitar?id=${encodeURIComponent(id)}`);
  const activation = await activateMembership(membership, data.user);
  if (activation === "limit") redirect("/login-cliente?erro=limite");
  if (activation !== "accepted") redirect("/login-cliente?erro=convite");
  redirect("/dashboard");
}

export async function acceptStaffInvitationAction(_state, formData) {
  const id = invitationId(formData);
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("password_confirm") || "");
  if (!id) return { ok: false, message: "Convite inválido." };
  if (password.length < 8 || password !== confirm) return { ok: false, message: "Informe e confirme uma senha de pelo menos oito caracteres." };
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) return { ok: false, message: "Sessão expirada. Abra novamente o link do convite." };
  const membership = await pendingMembership(id);
  if (!membership?.invite_requires_password || !canAcceptStaffInvitation(membership, auth.user)) {
    return { ok: false, message: "Convite expirado ou já utilizado." };
  }
  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) return { ok: false, message: "Não foi possível definir a senha. Tente novamente." };
  const activation = await activateMembership(membership, auth.user);
  if (activation !== "accepted") return { ok: false, message: activation === "limit"
    ? "O limite de usuários ou o acesso da clínica impede este convite. Peça ao gestor para regularizar e tente novamente."
    : "Convite expirado ou já utilizado." };
  redirect("/dashboard");
}
