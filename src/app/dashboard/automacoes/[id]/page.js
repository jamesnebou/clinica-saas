import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, CirclePause, CirclePlay, History, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { AutomationBuilder } from "@/components/automations/automation-builder";
import { PageHeader } from "@/components/app-shell/ui";
import { requireClinicSection } from "@/lib/auth/session";
import { getAutomationDetail } from "@/lib/automations/service.js";
import { cancelAutomationRunAction, publishAutomationAction, saveAutomationDraftAction, setAutomationStatusAction } from "../actions";

export const metadata = { title: "Builder de automação | NexaWi Clínicas" };

function Notice({ children, tone = "success" }) {
  const style = tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div className={`mt-5 rounded-lg border p-4 text-sm font-semibold ${style}`}>{children}</div>;
}

function valueOf(value) { return Array.isArray(value) ? value[0] : String(value || ""); }

function pageHref(id, query, page) {
  const params = new URLSearchParams();
  for (const key of ["status", "trigger", "entity", "from", "to"]) {
    const value = valueOf(query?.[key]);
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `/dashboard/automacoes/${id}?${params.toString()}#runs`;
}

export default async function AutomationDetailPage({ params, searchParams }) {
  const { activeClinic } = await requireClinicSection("automacoes");
  const { id } = await params;
  const query = await searchParams;
  const filters = {
    status: valueOf(query?.status), trigger: valueOf(query?.trigger), entity: valueOf(query?.entity),
    from: valueOf(query?.from), to: valueOf(query?.to), page: valueOf(query?.page),
  };
  let detail;
  try { detail = await getAutomationDetail(activeClinic.id, id, filters); } catch (error) { if (["PGRST116", "22P02"].includes(error?.code)) notFound(); throw error; }
  const { automation, versions, runs, pagination } = detail;

  return <div>
    <Link href="/dashboard/automacoes" className="inline-flex items-center gap-2 text-sm font-bold text-neutral-600 hover:text-neutral-950"><ArrowLeft size={16}/> Voltar às automações</Link>
    <div className="mt-4"><PageHeader eyebrow="Builder" title={automation.name} description="O rascunho pode evoluir sem modificar versões usadas por execuções já iniciadas." /></div>
    {query?.saved ? <Notice>Rascunho salvo com segurança.</Notice> : null}
    {query?.warning === "invalid" ? <Notice tone="error">O rascunho foi salvo, mas ainda possui pendências de validação e não pode ser publicado.</Notice> : null}
    {query?.published ? <Notice>Nova versão publicada e ativada.</Notice> : null}
    {query?.error ? <Notice tone="error">Não foi possível concluir a operação. {query?.details || "Revise a definição e tente novamente."}</Notice> : null}

    <nav aria-label="Seções da automação" className="mt-6 flex flex-wrap gap-2 rounded-lg border border-neutral-200 bg-white/75 p-2">
      {[['overview','Visão geral'],['builder','Builder'],['runs','Execuções'],['settings','Configurações']].map(([anchor, label]) => <a key={anchor} href={`#${anchor}`} className="rounded-lg px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-950 hover:text-white">{label}</a>)}
    </nav>

    <section id="overview" className="mt-6 scroll-mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white/75 p-4">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--clinic-primary)]">Estado atual</p><p className="mt-1 font-black">{automation.status === "active" ? "Ativa" : automation.status === "paused" ? "Pausada" : automation.status === "archived" ? "Arquivada" : "Rascunho"} · {versions.length} versão(ões)</p></div>
      <div className="flex flex-wrap gap-2">{automation.current_version_id ? <form action={setAutomationStatusAction}><input type="hidden" name="automation_id" value={automation.id}/><input type="hidden" name="status" value={automation.status === "active" ? "paused" : "active"}/><button className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-bold">{automation.status === "active" ? <CirclePause size={16}/> : <CirclePlay size={16}/>} {automation.status === "active" ? "Pausar" : "Reativar"}</button></form> : null}<form action={publishAutomationAction}><input type="hidden" name="automation_id" value={automation.id}/><button className="inline-flex items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-bold text-white"><ShieldCheck size={16}/> Validar e publicar</button></form></div>
    </section>

    <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {versions.slice(0, 4).map((version) => <article key={version.id} className="rounded-lg border border-neutral-200 bg-white/70 p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-neutral-500">Versão {version.version}</p><p className="mt-2 text-sm font-bold">{version.status === "active" ? "Publicada" : "Substituída"}</p><p className="mt-1 text-xs text-neutral-500">{new Date(version.created_at).toLocaleString("pt-BR")}</p></article>)}
    </section>

    <div id="builder" className="mt-6 scroll-mt-6"><AutomationBuilder automation={automation} saveAction={saveAutomationDraftAction}/></div>

    <section id="runs" className="mt-8 scroll-mt-6 premium-panel rounded-lg p-5"><div className="flex items-center gap-2"><History size={19}/><h2 className="text-xl font-black">Execuções e timeline</h2></div><p className="mt-1 text-sm text-neutral-500">Histórico paginado no servidor e vinculado à versão imutável que originou cada execução.</p>
      <form method="get" className="mt-5 grid gap-3 rounded-lg border border-neutral-200 bg-white/70 p-4 md:grid-cols-3 xl:grid-cols-6">
        <label className="text-xs font-bold text-neutral-600">Status<select name="status" defaultValue={filters.status} className="dashboard-field mt-1 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3"><option value="">Todos</option>{["queued","running","waiting","completed","failed","cancelled","skipped"].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label className="text-xs font-bold text-neutral-600">Evento<input name="trigger" defaultValue={filters.trigger} placeholder="booking.created" className="dashboard-field mt-1 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3"/></label>
        <label className="text-xs font-bold text-neutral-600">Entidade<input name="entity" defaultValue={filters.entity} placeholder="booking" className="dashboard-field mt-1 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3"/></label>
        <label className="text-xs font-bold text-neutral-600">De<input type="date" name="from" defaultValue={filters.from} className="dashboard-field mt-1 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3"/></label>
        <label className="text-xs font-bold text-neutral-600">Até<input type="date" name="to" defaultValue={filters.to} className="dashboard-field mt-1 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3"/></label>
        <button className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white"><SlidersHorizontal size={16}/> Filtrar</button>
      </form>
      <div className="mt-5 space-y-4">{runs.map((run) => <details key={run.id} className="rounded-lg border border-neutral-200 bg-white/75 p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{run.source_event_type}</strong><p className="mt-1 text-xs text-neutral-500">{new Date(run.created_at).toLocaleString("pt-BR")} · {run.entity_type || "sem entidade"}</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold">{run.status}</span></div></summary>
        <ol className="mt-4 space-y-2 border-t border-neutral-200 pt-4">{(run.automation_run_steps || []).sort((a, b) => new Date(a.started_at) - new Date(b.started_at)).map((step) => <li key={`${step.step_id}-${step.started_at}`} className="rounded-lg bg-neutral-50 p-3 text-sm"><div className="flex items-center justify-between gap-3"><strong>{step.step_type === "trigger" ? "Evento recebido" : step.action_type || step.step_type}</strong><span className="text-xs font-bold">{step.status}</span></div><p className="mt-1 text-xs text-neutral-500">{step.error_message || (step.status === "waiting" && step.result?.resume_at ? `Aguardando até ${new Date(step.result.resume_at).toLocaleString("pt-BR")}` : step.status === "skipped" ? "Condição não atendida" : "Etapa processada")}</p></li>)}</ol>
        {run.status === "waiting" ? <form action={cancelAutomationRunAction} className="mt-3"><input type="hidden" name="automation_id" value={automation.id}/><input type="hidden" name="run_id" value={run.id}/><button className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700">Cancelar execução</button></form> : null}
      </details>)}{!runs.length ? <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">Nenhuma execução corresponde aos filtros informados.</div> : null}</div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-neutral-200 pt-4"><p className="text-xs text-neutral-500">Página {pagination.page} de {pagination.pages} · {pagination.total} execução(ões)</p><div className="flex gap-2">{pagination.page > 1 ? <Link href={pageHref(id, query, pagination.page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-bold"><ChevronLeft size={14}/> Anterior</Link> : null}{pagination.page < pagination.pages ? <Link href={pageHref(id, query, pagination.page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-bold">Próxima <ChevronRight size={14}/></Link> : null}</div></div>
    </section>

    <section id="settings" className="mt-8 scroll-mt-6 rounded-lg border border-neutral-200 bg-white/70 p-5"><h2 className="text-xl font-black">Configurações e segurança</h2><p className="mt-2 text-sm text-neutral-600">A versão publicada é imutável. Alterações permanecem no rascunho até uma nova validação e publicação. Ações sensíveis também dependem da política de execução do ambiente.</p></section>
  </div>;
}
