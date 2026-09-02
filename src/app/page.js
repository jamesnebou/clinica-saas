import { MarketingPortal } from "@/components/marketing/marketing-portal";
import { marketingSegments } from "@/lib/marketing/segments";
import { toMarketingPlans } from "@/lib/marketing/plans";
import { getSystemPlans } from "@/lib/saas/plans";

export const metadata = {
  title: "NexaWi Clínicas | Gestão para diferentes especialidades",
  description: "Plataforma de gestão para clínicas de estética, odontologia, fisioterapia, medicina, psicologia, nutrição, pilates e equipes multidisciplinares.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "NexaWi Clínicas | Gestão para diferentes especialidades",
    description: "Agenda, pacientes, CRM, prontuário, financeiro, site e automações em uma estrutura adaptável à sua clínica.",
    url: "/",
    type: "website",
    images: [{ url: "/marketing/multisegment-hero.jpg", width: 1536, height: 1024, alt: "Equipe multidisciplinar utilizando a NexaWi Clínicas" }],
  },
};

export default async function Home() {
  const plans = toMarketingPlans(await getSystemPlans());
  return <MarketingPortal segments={marketingSegments} plans={plans} />;
}
