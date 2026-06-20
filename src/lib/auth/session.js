import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isInternalAdminEmail } from "@/lib/saas/plans";
import { canAccessSection, getCurrentMembership } from "@/lib/auth/permissions";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return null;
  }

  return data.user;
}

export async function requireUser(loginPath = "/login-cliente") {
  const user = await getCurrentUser();

  if (!user) {
    redirect(loginPath);
  }

  return user;
}

export async function getUserClinics() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) {
    return { user: null, memberships: [], activeClinic: null };
  }

  const { data, error } = await supabase
    .from("usuarios_clinica")
    .select("id, clinica_id, papel, nome, email, ativo, clinicas(id, nome, slug, documento, telefone, email, cidade, estado, status, plano, metadata, trial_ends_at, billing_email, asaas_customer_id, asaas_subscription_id, assinatura_status, proxima_cobranca_em, bloqueada_em, bloqueio_motivo)")
    .eq("ativo", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro ao carregar clinicas do usuario:", error);
    return { user, memberships: [], activeClinic: null, error };
  }

  const memberships = data || [];
  const activeClinic = memberships[0]?.clinicas || null;

  return { user, memberships, activeClinic, isInternalAdmin: isInternalAdminEmail(user.email) };
}

export async function requireClinic() {
  await requireUser();
  const context = await getUserClinics();

  return context;
}

export async function requireClinicSection(section) {
  const context = await requireClinic();
  const activeClinic = context.activeClinic;

  if (!activeClinic) {
    return context;
  }

  const membership = getCurrentMembership(context.memberships, activeClinic.id);
  if (!canAccessSection(membership?.papel, section)) {
    redirect("/dashboard?erro=permissao");
  }

  return context;
}

export async function requireInternalAdmin() {
  const user = await requireUser("/login?next=/admin");

  if (!isInternalAdminEmail(user.email)) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login?erro=admin");
  }

  return user;
}
