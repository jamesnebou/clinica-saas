import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isInternalAdminUser } from "@/lib/auth/session";
import LoginForm from "./login-form";

export const metadata = {
  title: "Admin | Clinica SaaS",
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const user = await getCurrentUser();

  if (user && isInternalAdminUser(user)) {
    redirect("/admin");
  }

  if (user && !isInternalAdminUser(user)) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  return (
    <main className="grid min-h-screen bg-[#f7f7f4] text-neutral-950 lg:grid-cols-[1fr_520px]">
      <section className="hidden min-h-screen flex-col justify-between border-r border-neutral-200 bg-neutral-950 p-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2 text-emerald-300"><Sparkles size={20} /><span className="text-sm font-bold uppercase tracking-[0.18em]">Clinica SaaS</span></Link>
        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">Admin interno</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight">Gestão comercial do SaaS.</h1>
          <p className="mt-5 text-sm leading-7 text-neutral-300">Entrada exclusiva para operar planos, status de clínicas, cobrança e suporte administrativo.</p>
          <div className="mt-8 rounded-lg border border-white/10 bg-white/5 p-4"><ShieldCheck className="text-emerald-300" size={22} /><p className="mt-3 text-sm leading-6 text-neutral-300">Admins liberados no Supabase Auth acessam o painel. INTERNAL_ADMIN_EMAILS fica apenas como fallback inicial.</p></div>
        </div>
        <Link href="/login-cliente" className="text-sm font-semibold text-neutral-300 hover:text-white">Entrar como clínica cliente</Link>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link href="/" className="flex items-center gap-2 text-emerald-800"><Sparkles size={19} /><span className="text-sm font-bold uppercase tracking-[0.18em]">Clinica SaaS</span></Link>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-950 text-white"><LockKeyhole size={21} /></div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Admin interno</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Entrar no painel admin</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">Use seu e-mail administrativo para acessar `/admin`.</p>
            {params?.erro === "admin" ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Acesso administrativo restrito. Entre com um e-mail liberado.</p> : null}
            <LoginForm mode="admin" next="/admin" emailPlaceholder="admin@seudominio.com" submitLabel="Entrar no admin" />
          </div>
        </div>
      </section>
    </main>
  );
}
