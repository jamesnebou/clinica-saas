import Link from "next/link";
import { Activity, CirclePause, CirclePlay, Clock3, Plus, Workflow } from "lucide-react";
import { PageHeader } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { getAutomationDashboard } from "@/lib/automations/service.js";
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates.mjs";
import { createAutomationAction, setAutomationStatusAction } from "./actions";

export const metadata = { title: "Automações | NexaWi Clínicas" };

const statusLabel = { draft: "Rascunho", active: "Ativa", paused: "Pausada", archived: "Arquivada" };

function Metric({ label, value, detail }) {
  return <article className="premium-panel rounded-lg p-5"><p className="text-sm text-neutral-500">{label}</p><strong className="mt-2 block text-3xl font-black">{value}</strong><p className="mt-1 text-xs text-neutral-500">{detail}</p></article>;
}

export default async function AutomacoesPage() {
  const { activeClinic } = await requireClinicSection("automacoes");
  const dashboard = await getAutomationDashboard(activeClinic.id);
  const totalFinished = Number(dashboard.metrics.completed || 0) + Number(dashboard.metrics.failed || 0);
  const successRate = totalFinished ? Math.round((Number(dashboard.metrics.completed || 0) / totalFinished) * 100) : 0;

  const missingBase = ["automations", "automation_runs"].includes(dashboard.schemaIssue?.resource);

  return <main className="min-w-0 w-full overflow-x-hidden px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
    <section className="mx-auto w-full min-w-0 max-w-[1680px]">
    <PageHeader eyebrow="Motor 2.0" title="Automações da clínica" description="Detecte eventos, avalie regras e orquestre CRM, Agenda, Financeiro e comunicações com histórico auditável." action={<a href="#nova" className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-neutral-950 px-4 py-3 text-sm font-bold text-white"><Plus size={17}/> Nova automação</a>} />
    {!dashboard.available ? <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
      <p className="font-black">Schema do Motor 2.0 incompleto</p>
      <p className="mt-1">{missingBase ? "As tabelas centrais ainda não estão disponíveis. Aplique primeiro a migration `20260830100000_automation_engine_v2.sql` e, em seguida, reaplique `20260830110000_automation_engine_v2_hardening.sql`." : "A tabela de tarefas ainda não está disponível. Reaplique a migration `20260830110000_automation_engine_v2_hardening.sql`."}</p>
      {dashboard.schemaIssue?.resource ? <p className="mt-2 text-xs text-amber-800">Recurso indisponível: <strong>{dashboard.schemaIssue.resource}</strong> · código {dashboard.schemaIssue.code}</p> : null}
    </section> : <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Automações ativas" value={dashboard.metrics.active || 0} detail="versões publicadas em execução" />
        <Metric label="Taxa de sucesso" value={`${successRate}%`} detail={`${dashboard.metrics.completed || 0} runs concluídos`} />
        <Metric label="Falhas recentes" value={dashboard.metrics.failed || 0} detail="com diagnóstico no histórico" />
        <Metric label="Esperas pendentes" value={dashboard.metrics.waiting || 0} detail="retomadas pelo scheduler" />
      </section>

      <section className="mt-7 grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="premium-panel rounded-lg p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Fluxos configurados</h2><p className="mt-1 text-sm text-neutral-500">Edite o rascunho sem alterar runs iniciados por versões anteriores.</p></div><Workflow className="text-[var(--clinic-primary)]" /></div>
          <div className="mt-5 space-y-3">{dashboard.automations.length ? dashboard.automations.map((item) => <article key={item.id} className="rounded-lg border border-neutral-200 bg-white/75 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/dashboard/automacoes/${item.id}`} className="text-base font-black hover:text-[var(--clinic-primary)]">{item.name}</Link><p className="mt-1 text-xs text-neutral-500">{item.trigger_type}</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold">{statusLabel[item.status] || item.status}</span></div>
            <p className="mt-3 text-sm text-neutral-600">{item.description || "Automação sem descrição."}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 border-y border-neutral-200 py-3 text-xs sm:grid-cols-4">
              <div><dt className="text-neutral-500">Última execução</dt><dd className="mt-1 font-bold">{item.recent_stats.lastRun ? new Date(item.recent_stats.lastRun.created_at).toLocaleString("pt-BR") : "Ainda não executada"}</dd></div>
              <div><dt className="text-neutral-500">Execuções</dt><dd className="mt-1 font-bold">{item.recent_stats.runs} recentes</dd></div>
              <div><dt className="text-neutral-500">Sucesso</dt><dd className="mt-1 font-bold">{item.recent_stats.successRate === null ? "Sem amostra" : `${item.recent_stats.successRate}%`}</dd></div>
              <div><dt className="text-neutral-500">Ações</dt><dd className="mt-1 font-bold">{item.recent_stats.actions} processadas</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2"><Link href={`/dashboard/automacoes/${item.id}`} className="rounded-lg bg-neutral-950 px-3 py-2 text-xs font-bold text-white">Abrir builder</Link>{item.status === "active" ? <form action={setAutomationStatusAction}><input type="hidden" name="automation_id" value={item.id}/><input type="hidden" name="status" value="paused"/><button className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-bold"><CirclePause size={14}/> Pausar</button></form> : item.current_version_id ? <form action={setAutomationStatusAction}><input type="hidden" name="automation_id" value={item.id}/><input type="hidden" name="status" value="active"/><button className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-bold"><CirclePlay size={14}/> Reativar</button></form> : null}</div>
          </article>) : <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center"><p className="font-bold">Nenhuma automação criada</p><p className="mt-1 text-sm text-neutral-500">Use um modelo seguro ou inicie um fluxo do zero.</p></div>}</div>
        </div>
        <aside className="space-y-5">
          <section className="premium-panel rounded-lg p-5"><h2 className="flex items-center gap-2 text-lg font-black"><Activity size={18}/> Execuções recentes</h2><div className="mt-4 space-y-2">{dashboard.runs.slice(0, 8).map((run) => <div key={run.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white/70 p-3 text-xs"><div><p className="font-bold">{run.source_event_type}</p><p className="text-neutral-500">{new Date(run.created_at).toLocaleString("pt-BR")}</p></div><span className="font-bold">{run.status}</span></div>)}{!dashboard.runs.length ? <p className="text-sm text-neutral-500">Ainda não há execuções.</p> : null}</div></section>
          <section className="premium-panel rounded-lg p-5"><h2 className="flex items-center gap-2 text-lg font-black"><Clock3 size={18}/> Tarefas abertas</h2><div className="mt-4 space-y-2">{dashboard.tasks.map((task) => <div key={task.id} className="rounded-lg border border-neutral-200 bg-white/70 p-3 text-sm"><strong>{task.title}</strong><p className="mt-1 text-xs text-neutral-500">{task.due_at ? new Date(task.due_at).toLocaleString("pt-BR") : "Sem prazo"}</p></div>)}{!dashboard.tasks.length ? <p className="text-sm text-neutral-500">Nenhuma tarefa gerada pelo motor.</p> : null}</div></section>
        </aside>
      </section>

      <section id="nova" className="mt-8 scroll-mt-8"><div className="mb-4"><h2 className="text-xl font-black">Galeria de modelos</h2><p className="mt-1 text-sm text-neutral-500">Os modelos são criados pausados e precisam ser revisados antes da publicação.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{AUTOMATION_TEMPLATES.map((template) => <form key={template.id} action={createAutomationAction} className="premium-panel flex min-h-52 flex-col rounded-lg p-5"><input type="hidden" name="template_id" value={template.id}/><h3 className="font-black">{template.name}</h3><p className="mt-2 flex-1 text-sm text-neutral-600">{template.description}</p><button className="mt-5 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-bold hover:border-[var(--clinic-primary)]">Usar modelo</button></form>)}</div>
        <form action={createAutomationAction} className="mt-4 premium-panel flex flex-col gap-3 rounded-lg p-5 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-bold">Criar do zero<input name="name" required placeholder="Nome da automação" className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3"/></label><button className="h-11 rounded-lg bg-neutral-950 px-5 font-bold text-white">Criar rascunho</button></form>
      </section>
    </>}
    </section>
  </main>;
}
