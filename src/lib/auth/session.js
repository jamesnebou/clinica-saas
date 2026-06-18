import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return null;
  }

  return data.user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
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
    .select("id, clinica_id, papel, nome, email, ativo, clinicas(id, nome, slug, cidade, estado, status, plano)")
    .eq("ativo", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro ao carregar clinicas do usuario:", error);
    return { user, memberships: [], activeClinic: null, error };
  }

  const memberships = data || [];
  const activeClinic = memberships[0]?.clinicas || null;

  return { user, memberships, activeClinic };
}

export async function requireClinic() {
  await requireUser();
  const context = await getUserClinics();

  return context;
}
