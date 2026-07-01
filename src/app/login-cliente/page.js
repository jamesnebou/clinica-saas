import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, LockKeyhole, Palette, Sparkles } from "lucide-react";
import { getUserClinics } from "@/lib/auth/session";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo/demo-account";
import LoginForm from "@/app/login/login-form";

export const metadata = {
  title: "Login da clínica | NexaWi Clínicas",
};

export default async function LoginClientePage() {
  const { user, activeClinic } = await getUserClinics();

  if (user && activeClinic) {
    redirect("/dashboard");
  }

  if (user && !activeClinic) {
    redirect("/onboarding");
  }

  return (
    <main className="grid min-h-screen bg-[#f7f7f4] text-neutral-950 lg:grid-cols-[1fr_520px]">
      <section className="hidden min-h-screen flex-col justify-between border-r border-neutral-200 bg-white p-10 lg:flex">
        <Link href="/" className="flex items-center gap-2 text-[#ed7009]">
          <Sparkles size={20} />
          <span className="text-sm font-bold uppercase tracking-[0.18em]">NexaWi Clínicas</span>
        </Link>

        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#ed7009]">Área da clínica</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight">Entre para operar sua clínica.</h1>
          <p className="mt-5 text-sm leading-7 text-neutral-600">
            Acesso para recepção, gestores, profissionais e financeiro visualizarem a operação da clínica com identidade própria.
          </p>
          <div className="mt-8 grid gap-3">
            <div className="rounded-lg border border-neutral-200 p-4">
              <CalendarCheck className="text-[#ed7009]" size={22} />
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Agenda, clientes, prontuário, financeiro e assinatura em um só painel.
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-4">
              <Palette className="text-[#ed7009]" size={22} />
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Quando a clínica tiver logo e cores no cadastro, o dashboard assume essa identidade visual.
              </p>
            </div>
          </div>
        </div>

        <Link href="/login" className="text-sm font-semibold text-neutral-600 hover:text-neutral-950">
          Sou administrador interno
        </Link>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link href="/" className="flex items-center gap-2 text-[#ed7009]">
              <Sparkles size={19} />
              <span className="text-sm font-bold uppercase tracking-[0.18em]">NexaWi Clínicas</span>
            </Link>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-50 text-[#ed7009]">
              <LockKeyhole size={21} />
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-[#ed7009]">Área da clínica</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">Entrar no dashboard</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">Use o e-mail cadastrado na equipe da sua clínica.</p>

            <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-neutral-800">
              <p className="font-black text-[#ed7009]">Quer testar antes?</p>
              <p className="mt-2 leading-6">
                Entre com a conta demo abaixo. Os dados são restaurados automaticamente para cada demonstração.
              </p>
              <div className="mt-3 rounded-md bg-white px-3 py-2 font-semibold">
                <p>E-mail: {DEMO_EMAIL}</p>
                <p>Senha: {DEMO_PASSWORD}</p>
              </div>
            </div>

            <LoginForm mode="cliente" next="/dashboard" emailPlaceholder="voce@clinica.com" submitLabel="Entrar no dashboard" />
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-neutral-500">
            Ao acessar, você concorda com os{" "}
            <Link className="font-semibold text-neutral-800" href="/termos">
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link className="font-semibold text-neutral-800" href="/privacidade">
              Política de Privacidade
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
