import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import LoginForm from "./login-form";

export const metadata = {
  title: "Login | Clinica SaaS",
};

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-screen bg-[#f7f7f4] text-neutral-950 lg:grid-cols-[1fr_520px]">
      <section className="hidden min-h-screen flex-col justify-between border-r border-neutral-200 bg-white p-10 lg:flex">
        <Link href="/" className="flex items-center gap-2 text-emerald-800"><Sparkles size={20} /><span className="text-sm font-bold uppercase tracking-[0.18em]">Clinica SaaS</span></Link>
        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Painel da clínica</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight">Agenda, prontuário e financeiro no mesmo lugar.</h1>
          <div className="mt-8 grid gap-3">
            <div className="rounded-lg border border-neutral-200 p-4"><CalendarCheck className="text-emerald-700" size={22} /><p className="mt-3 text-sm leading-6 text-neutral-600">Controle a rotina da recepção sem perder retorno, pagamento ou informação clínica.</p></div>
            <div className="rounded-lg border border-neutral-200 p-4"><ShieldCheck className="text-emerald-700" size={22} /><p className="mt-3 text-sm leading-6 text-neutral-600">Acesso protegido por Supabase Auth e dados separados por clínica.</p></div>
          </div>
        </div>
        <p className="text-sm text-neutral-500">Use apenas em dispositivos confiáveis da clínica.</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link href="/" className="flex items-center gap-2 text-emerald-800"><Sparkles size={19} /><span className="text-sm font-bold uppercase tracking-[0.18em]">Clinica SaaS</span></Link>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800"><LockKeyhole size={21} /></div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Acesso seguro</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Entrar no painel</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">Use o e-mail cadastrado na equipe da clínica para acessar a operação.</p>
            <LoginForm />
          </div>
          <p className="mt-5 text-center text-xs leading-5 text-neutral-500">Ao acessar, você concorda com os <Link className="font-semibold text-neutral-800" href="/termos">Termos de Uso</Link> e a <Link className="font-semibold text-neutral-800" href="/privacidade">Política de Privacidade</Link>.</p>
        </div>
      </section>
    </main>
  );
}
