import { redirect } from "next/navigation";
import { getUserClinics, requireUser } from "@/lib/auth/session";
import ClinicForm from "./clinic-form";

export const metadata = { title: "Criar clínica | Clínica SaaS" };

export default async function OnboardingPage() {
  const user = await requireUser("/login-cliente");
  const { activeClinic } = await getUserClinics();

  if (activeClinic) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#f7f7f4] px-5 py-10 text-neutral-950">
      <section className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Onboarding</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Crie a primeira clínica</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
          Este fluxo substitui o bootstrap manual por SQL para novos clientes. O usuário logado será vinculado como owner da clínica.
        </p>
        <ClinicForm userEmail={user.email} />
      </section>
    </main>
  );
}
