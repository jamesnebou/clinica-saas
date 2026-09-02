import { SegmentLandingPage } from "@/components/marketing/segment-landing-page";
import { esteticaLanding } from "@/lib/marketing/segments";
import { toMarketingPlans } from "@/lib/marketing/plans";
import { getSystemPlans } from "@/lib/saas/plans";

export const metadata = {
  title: esteticaLanding.metadata.title,
  description: esteticaLanding.metadata.description,
  alternates: { canonical: "/estetica" },
  openGraph: {
    title: esteticaLanding.metadata.title,
    description: esteticaLanding.metadata.description,
    url: "/estetica",
    type: "website",
    images: [{ url: "/marketing/estetica/hero.jpg", width: 1536, height: 1024, alt: esteticaLanding.hero.imageAlt }],
  },
};

export default async function EsteticaPage() {
  const plans = toMarketingPlans(await getSystemPlans());
  return <SegmentLandingPage config={esteticaLanding} plans={plans} />;
}
