import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { requireClinic, resolveClinicPlanEntitlements } from "@/lib/auth/session";
import { canUseClinicAi } from "@/lib/ai/access.mjs";
import { PageHeader } from "@/components/app-shell/ui";
import { AiWorkspace } from "./ai-workspace";

export default async function ClinicAiPage() {
  const context = await requireClinic();
  const clinic = await resolveClinicPlanEntitlements(context);
  if (!canUseClinicAi(context, clinic)) notFound();
  const scopeKey = createHash("sha256")
    .update("clinic-ai\0")
    .update(context.user.id)
    .update("\0")
    .update(clinic.id)
    .digest("hex");

  return (
    <main className="min-w-0 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <PageHeader eyebrow="NexaWi IA" title="Seu copiloto de gestão" description="Converse sobre os indicadores da sua clínica." />
        <AiWorkspace key={scopeKey} scopeKey={scopeKey} />
      </div>
    </main>
  );
}
