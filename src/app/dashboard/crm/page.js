import { PageHeader, Notice } from "@/components/app-shell/ui";
import { CrmBoard } from "@/components/crm/crm-board";
import { requireClinicSection } from "@/lib/auth/session";
import { getCrmWorkspace } from "@/lib/crm/service";

export const metadata = { title: "CRM 2.0 | NexaWi Clínicas" };

export default async function CrmPage({ searchParams }) {
  const params = await searchParams;
  const { activeClinic } = await requireClinicSection("crm");
  const workspace = await getCrmWorkspace(activeClinic.id, { pipelineId: params?.pipeline || null });
  return <main className="min-w-0 w-full px-4 py-8 sm:px-6 lg:px-8">
    <section className="mx-auto w-full min-w-0 max-w-[1680px]">
      <PageHeader eyebrow="CRM 2.0" title="Pipeline comercial" description="Transforme contatos em oportunidades, organize follow-ups e acompanhe cada negociação até o fechamento." />
      {!workspace.available ? <div className="mt-6"><Notice type="warning" title="CRM 2.0 aguardando ativação">Aplique as migrations `20260828101000` até `20260828105000` no Supabase, nessa ordem.</Notice></div> : <CrmBoard workspace={workspace} />}
    </section>
  </main>;
}
