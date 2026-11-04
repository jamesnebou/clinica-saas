import { notFound } from "next/navigation";
import { requireClinic, resolveClinicPlanEntitlements } from "@/lib/auth/session";
import { canUseClinicAi } from "@/lib/ai/access.mjs";
import { PageHeader } from "@/components/app-shell/ui";
import { ClinicSummaryPanel } from "./summary-panel";

export default async function ClinicAiPage() {
  const context = await requireClinic();
  const clinic = await resolveClinicPlanEntitlements(context);
  if (!canUseClinicAi(context, clinic)) notFound();

  return (
    <main className="min-w-0 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <PageHeader eyebrow="Análise de gestão" title="NexaWi IA" description="Resumo inteligente da sua clínica" />
        <ClinicSummaryPanel />
      </div>
    </main>
  );
}
