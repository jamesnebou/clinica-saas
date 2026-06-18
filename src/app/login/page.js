import { redirect } from "next/navigation";
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
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7f4] px-5 py-10 text-neutral-950">
      <section className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Acesso</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Entrar no Clinica SaaS</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          Use o e-mail cadastrado na equipe da clínica. A autenticação já usa Supabase Auth.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
