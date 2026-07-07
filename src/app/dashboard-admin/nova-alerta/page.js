import { CreateClinicForm, PageHero } from "../admin-core";
import { getSystemPlans } from "@/lib/saas/plans";

export const metadata = { title: "Nova clínica admin | NexaWi Clínicas" };

export default async function DashboardAdminNovaClinicaPage() {
  const plans = await getSystemPlans();

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Nova clínica" title="Cadastrar nova clínica" description="Crie a clínica, defina o plano inicial e entregue o primeiro acesso owner sem depender de e-mail de convite." />
      <CreateClinicForm plans={plans} />
    </div>
  );
}

