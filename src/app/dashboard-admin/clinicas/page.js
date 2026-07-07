import { ClinicEditCard, PageHero, loadDashboardAdminData } from "../admin-core";

export const metadata = { title: "Clínicas admin | NexaWi Clínicas" };

export default async function DashboardAdminClinicasPage() {
  const { plans, enrichedClinics } = await loadDashboardAdminData();

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Clínicas" title="Gestão das clínicas" description="Visualize, edite plano, status comercial, cobrança, isenção e integrações comerciais de cada clínica." />

      <section className="space-y-4">
        {enrichedClinics.length ? (
          enrichedClinics.map((clinic) => <ClinicEditCard key={clinic.id} clinic={clinic} plans={plans} />)
        ) : (
          <p className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm">Nenhuma clínica cadastrada.</p>
        )}
      </section>
    </div>
  );
}

