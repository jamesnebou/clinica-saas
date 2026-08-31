import { redirect } from "next/navigation";
import { getUserClinics, requireUser } from "@/lib/auth/session";
import { normalizeSelectedPlan } from "@/lib/auth/self-service.mjs";
import ClinicForm from "./clinic-form";

export const metadata = { title: "Criar clínica | NexaWi Clínicas" };

export default async function OnboardingPage({ searchParams }) {
  const params = await searchParams;
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
          Cadastre a operação, escolha o segmento principal e adicione especialidades complementares. O usuário logado será vinculado como owner da clínica.
        </p>
        <ClinicForm
          userEmail={user.email}
          userPhone={user.user_metadata?.phone || ""}
          selectedPlan={normalizeSelectedPlan(params?.plan || user.user_metadata?.selected_plan)}
        />
      </section>
    </main>
  );
}
