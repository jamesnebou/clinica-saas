import { SegmentLandingPage } from "@/components/marketing/segment-landing-page";
import { getSegmentLanding } from "@/lib/marketing/segments";
import { toMarketingPlans } from "@/lib/marketing/plans";
import { getSystemPlans } from "@/lib/saas/plans";

const config = getSegmentLanding("multidisciplinar");

export const metadata = {
  title: config.metadata.title,
  description: config.metadata.description,
  alternates: { canonical: "/multidisciplinar" },
  openGraph: {
    title: config.metadata.title,
    description: config.metadata.description,
    url: "/multidisciplinar",
    type: "website",
    images: [{ url: config.hero.image, width: 1536, height: 1024, alt: config.hero.imageAlt }],
  },
};

export default async function MultidisciplinarPage() {
  const plans = toMarketingPlans(await getSystemPlans());
  return <SegmentLandingPage config={config} plans={plans} />;
}
