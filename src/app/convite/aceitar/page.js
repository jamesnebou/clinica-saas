import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canAcceptStaffInvitation } from "@/lib/auth/staff-invitation.mjs";
import { InvitationPasswordForm } from "./invitation-password-form";

export const metadata = { title: "Definir senha | NexaWi Clínicas" };

export default async function AcceptInvitationPage({ searchParams }) {
  const { id } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) redirect("/login-cliente?erro=convite");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login-cliente?erro=convite");
  const { data: membership, error } = await supabaseAdmin.from("usuarios_clinica")
    .select("id, user_id, email, ativo, accepted_at, invite_expires_at, invite_requires_password")
    .eq("id", id).maybeSingle();
  if (error || !membership?.invite_requires_password || !canAcceptStaffInvitation(membership, auth.user)) redirect("/login-cliente?erro=convite");
  return <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-5 py-10 text-neutral-950">
    <section className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <Link href="/" className="text-sm font-bold text-[#ed7009]">NexaWi Clínicas</Link>
      <h1 className="mt-5 text-2xl font-bold">Defina sua senha</h1>
      <p className="mt-2 text-sm text-neutral-600">Use uma senha exclusiva de pelo menos oito caracteres.</p>
      <InvitationPasswordForm id={id} />
    </section>
  </main>;
}
