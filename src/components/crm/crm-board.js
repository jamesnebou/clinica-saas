"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Activity, CalendarClock, Check, ChevronRight, CircleDollarSign, Flame, GripVertical, KanbanSquare, List, MessageCircle, Plus, Search, Settings2, Target, X } from "lucide-react";
import { createCrmActivityAction, createCrmOpportunityAction, moveCrmOpportunityAction, updateCrmOpportunityAction } from "@/app/dashboard/crm/actions";
import { CRM_ACTIVITY_TYPES, CRM_ORIGINS, CRM_TEMPERATURES } from "@/lib/crm/core.mjs";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = (value) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-";

function whatsappUrl(phone, name) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const number = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(`Olá, ${name}. Tudo bem? Estou entrando em contato pela clínica.`)}`;
}

function Metric({ label, value, detail, icon: Icon }) {
  return <section className="premium-panel min-w-[170px] rounded-lg p-4">
    <div className="flex items-start justify-between gap-3"><p className="text-xs font-bold uppercase text-neutral-500">{label}</p><Icon size={17} className="text-[var(--clinic-primary)]" /></div>
    <strong className="mt-2 block text-xl font-black text-neutral-950">{value}</strong>
    {detail ? <p className="mt-1 text-xs text-neutral-500">{detail}</p> : null}
  </section>;
}

function OpportunityCard({ item, stage, owner, onOpen }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, data: { type: "opportunity", stageId: item.stage_id } });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 };
  const wa = whatsappUrl(item.telefone, item.nome);
  return <article ref={setNodeRef} style={style} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm transition hover:border-[color-mix(in_srgb,var(--clinic-primary)_35%,#e5e5e5)] hover:shadow-[0_14px_30px_color-mix(in_srgb,var(--clinic-primary)_12%,transparent)]">
    <div className="flex items-start justify-between gap-2">
      <button type="button" onClick={() => onOpen(item.id)} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-black text-neutral-950">{item.titulo || item.nome}</p>
        <p className="mt-1 truncate text-xs text-neutral-600">{item.nome}</p>
      </button>
      <button ref={setActivatorNodeRef} {...attributes} {...listeners} type="button" title="Mover oportunidade" className="inline-flex h-8 w-8 shrink-0 touch-none items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"><GripVertical size={16} /></button>
    </div>
    <button type="button" onClick={() => onOpen(item.id)} className="mt-3 block w-full text-left">
      <div className="flex items-center justify-between gap-2 text-xs"><strong>{money(item.valor_estimado)}</strong><span className="rounded-full bg-neutral-100 px-2 py-1 font-bold">Score {item.score}</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100"><span className="block h-full rounded-full" style={{ width: `${stage.probabilidade}%`, backgroundColor: stage.cor }} /></div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-neutral-500"><span className="truncate">{owner?.nome || owner?.email || "Sem responsável"}</span><span className="capitalize">{item.temperatura}</span></div>
      {item.next_activity_at ? <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-[var(--clinic-primary)]"><CalendarClock size={12} /> {dateTime(item.next_activity_at)}</p> : <p className="mt-2 text-[11px] font-semibold text-amber-700">Sem próxima ação</p>}
    </button>
    <div className="mt-3 flex gap-2 border-t border-neutral-100 pt-2">
      {wa ? <a href={wa} target="_blank" rel="noreferrer" title="Abrir WhatsApp" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-[var(--clinic-primary)]"><MessageCircle size={15} /></a> : null}
      {item.cliente_id ? <Link href={`/dashboard/clientes/${item.cliente_id}`} className="inline-flex h-8 items-center rounded-md border border-neutral-200 px-2 text-[11px] font-bold">Ficha</Link> : null}
    </div>
  </article>;
}

function StageColumn({ stage, items, members, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}`, data: { type: "stage", stageId: stage.id } });
  const value = items.reduce((sum, item) => sum + Number(item.valor_estimado || 0), 0);
  return <section ref={setNodeRef} className={`w-[310px] shrink-0 rounded-lg border bg-neutral-50/85 p-3 transition ${isOver ? "border-[var(--clinic-primary)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--clinic-primary)_14%,transparent)]" : "border-neutral-200"}`}>
    <header className="mb-3 border-b border-neutral-200 pb-3">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black">{stage.nome}</h3><span className="rounded-full px-2.5 py-1 text-xs font-black text-white" style={{ backgroundColor: stage.cor }}>{items.length}</span></div>
      <div className="mt-2 flex justify-between text-[11px] text-neutral-500"><span>{money(value)}</span><span>{Number(stage.probabilidade)}% prob.</span></div>
    </header>
    <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
      <div className="min-h-28 space-y-2">{items.length ? items.map((item) => <OpportunityCard key={item.id} item={item} stage={stage} owner={members.find((member) => member.user_id === item.responsavel_id)} onOpen={onOpen} />) : <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-5 text-center text-xs text-neutral-500">Arraste uma oportunidade para esta etapa.</p>}</div>
    </SortableContext>
  </section>;
}

function ModalShell({ title, children, onClose, wide = false }) {
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-neutral-950/65 p-3 backdrop-blur-sm" onMouseDown={onClose}>
    <section className={`max-h-[92vh] w-full overflow-y-auto rounded-lg border border-white/20 bg-white p-5 shadow-2xl ${wide ? "max-w-3xl" : "max-w-xl"}`} onMouseDown={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between gap-4"><h2 className="text-xl font-black">{title}</h2><button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200" type="button" title="Fechar"><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}

function NewOpportunityModal({ pipelineId, stages, members, procedures, onClose }) {
  return <ModalShell title="Nova oportunidade" onClose={onClose} wide>
    <form action={createCrmOpportunityAction} className="mt-5 grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="pipeline_id" value={pipelineId} />
      <label className="sm:col-span-2"><span className="text-sm font-semibold">Título da oportunidade</span><input className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" name="titulo" placeholder="Ex.: Protocolo facial premium" required /></label>
      <label><span className="text-sm font-semibold">Nome do contato</span><input className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" name="nome" required /></label>
      <label><span className="text-sm font-semibold">WhatsApp</span><input className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" name="telefone" /></label>
      <label><span className="text-sm font-semibold">E-mail</span><input className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" name="email" type="email" /></label>
      <label><span className="text-sm font-semibold">Valor estimado</span><input className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" name="valor_estimado" type="number" min="0" step="0.01" defaultValue="0" /></label>
      <Select label="Etapa" name="stage_id" options={stages.map((item) => [item.id, item.nome])} />
      <Select label="Origem" name="origem" options={CRM_ORIGINS} defaultValue="whatsapp" />
      <Select label="Responsável" name="responsavel_id" options={members.map((item) => [item.user_id, item.nome || item.email])} empty="Sem responsável" />
      <Select label="Procedimento" name="procedimento_id" options={procedures.map((item) => [item.id, item.nome])} empty="Não definido" />
      <Select label="Temperatura" name="temperatura" options={CRM_TEMPERATURES.map((item) => [item.value, item.label])} defaultValue="morno" />
      <label><span className="text-sm font-semibold">Score</span><input className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" name="score" type="number" min="0" max="100" defaultValue="50" /></label>
      <label className="sm:col-span-2"><span className="text-sm font-semibold">Observações</span><textarea className="dashboard-field mt-2 min-h-24 w-full rounded-lg border border-neutral-200 p-3" name="observacoes" /></label>
      <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-11 rounded-lg border border-neutral-300 px-4 font-bold">Cancelar</button><button className="h-11 rounded-lg bg-neutral-950 px-5 font-bold text-white">Criar oportunidade</button></div>
    </form>
  </ModalShell>;
}

function Select({ label, name, options, defaultValue = "", empty }) {
  return <label><span className="text-sm font-semibold">{label}</span><select className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3" name={name} defaultValue={defaultValue}>{empty !== undefined ? <option value="">{empty}</option> : null}{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
}

function OpportunityDrawer({ item, stages, members, procedures, activities, events, appointments, lostReasons, onClose, onMove }) {
  const stage = stages.find((entry) => entry.id === item.stage_id);
  const relatedActivities = activities.filter((entry) => entry.opportunity_id === item.id);
  const relatedEvents = events.filter((entry) => entry.opportunity_id === item.id);
  const relatedAppointments = appointments.filter((entry) => entry.opportunity_id === item.id);
  const [targetStage, setTargetStage] = useState(item.stage_id);
  const target = stages.find((entry) => entry.id === targetStage);
  return <div className="fixed inset-0 z-[120] bg-neutral-950/55 backdrop-blur-sm" onMouseDown={onClose}>
    <aside onMouseDown={(event) => event.stopPropagation()} className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-7">
      <header className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[var(--clinic-primary)]">{stage?.nome}</p><h2 className="mt-2 text-2xl font-black">{item.titulo || item.nome}</h2><p className="mt-1 text-sm text-neutral-500">{item.nome} · {item.telefone || "sem telefone"}</p></div><button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200" type="button"><X size={18} /></button></header>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><Mini label="Valor" value={money(item.valor_estimado)} /><Mini label="Score" value={`${item.score}/100`} /><Mini label="Temperatura" value={item.temperatura} /></div>
      <form action={updateCrmOpportunityAction} className="mt-6 grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="opportunity_id" value={item.id} />
        <label className="sm:col-span-2"><span className="text-sm font-semibold">Título</span><input className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" name="titulo" defaultValue={item.titulo || ""} /></label>
        <label><span className="text-sm font-semibold">Valor estimado</span><input className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" name="valor_estimado" type="number" step="0.01" defaultValue={item.valor_estimado || 0} /></label>
        <Select label="Responsável" name="responsavel_id" defaultValue={item.responsavel_id || ""} empty="Sem responsável" options={members.map((member) => [member.user_id, member.nome || member.email])} />
        <Select label="Procedimento" name="procedimento_id" defaultValue={item.procedimento_id || ""} empty="Não definido" options={procedures.map((procedure) => [procedure.id, procedure.nome])} />
        <Select label="Temperatura" name="temperatura" defaultValue={item.temperatura} options={CRM_TEMPERATURES.map((entry) => [entry.value, entry.label])} />
        <label><span className="text-sm font-semibold">Score</span><input className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" name="score" type="number" min="0" max="100" defaultValue={item.score} /></label>
        <label className="sm:col-span-2"><span className="text-sm font-semibold">Observações comerciais</span><textarea className="dashboard-field mt-2 min-h-24 w-full rounded-lg border border-neutral-200 p-3" name="observacoes" defaultValue={item.observacoes || ""} /></label>
        <button className="h-11 rounded-lg bg-neutral-950 px-5 font-bold text-white sm:col-span-2">Salvar alterações</button>
      </form>
      <section className="mt-7 rounded-lg border border-neutral-200 p-4"><h3 className="font-black">Mover no funil</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><Select label="Etapa de destino" name="target_stage" defaultValue={targetStage} options={stages.map((entry) => [entry.id, entry.nome])} /><label className={target?.tipo === "lost" ? "block" : "hidden"}><span className="text-sm font-semibold">Motivo da perda</span><select id={`lost-${item.id}`} className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3">{lostReasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.nome}</option>)}</select></label></div><div className="mt-3 flex gap-2"><select value={targetStage} onChange={(event) => setTargetStage(event.target.value)} className="dashboard-field h-11 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3">{stages.map((entry) => <option key={entry.id} value={entry.id}>{entry.nome}</option>)}</select><button type="button" onClick={() => onMove(item.id, targetStage, target?.tipo === "lost" ? document.getElementById(`lost-${item.id}`)?.value : null)} className="h-11 rounded-lg bg-[var(--clinic-primary)] px-4 font-bold text-white">Mover</button></div></section>
      <section className="mt-7"><h3 className="font-black">Nova atividade</h3><form action={createCrmActivityAction} className="mt-3 grid gap-3 sm:grid-cols-2"><input type="hidden" name="opportunity_id" value={item.id} /><Select label="Tipo" name="tipo" options={CRM_ACTIVITY_TYPES} defaultValue="follow_up" /><label><span className="text-sm font-semibold">Prazo</span><input className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" name="due_at" type="datetime-local" /></label><label className="sm:col-span-2"><span className="text-sm font-semibold">Título</span><input className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" name="titulo" required /></label><label className="sm:col-span-2"><span className="text-sm font-semibold">Descrição</span><textarea className="dashboard-field mt-2 min-h-20 w-full rounded-lg border border-neutral-200 p-3" name="descricao" /></label><button className="h-10 rounded-lg border border-neutral-300 px-4 font-bold sm:col-span-2">Adicionar atividade</button></form></section>
      <section className="mt-7"><h3 className="font-black">Atividades</h3><div className="mt-3 space-y-2">{relatedActivities.length ? relatedActivities.map((activity) => <div key={activity.id} className="rounded-lg border border-neutral-200 p-3"><div className="flex justify-between gap-3"><strong className="text-sm">{activity.titulo}</strong><span className="text-xs text-neutral-500">{activity.status === "completed" ? "Concluída" : dateTime(activity.due_at)}</span></div><p className="mt-1 text-xs text-neutral-600">{activity.tipo} · {activity.descricao || "Sem descrição"}</p></div>) : <p className="text-sm text-neutral-500">Nenhuma atividade registrada.</p>}</div></section>
      <section className="mt-7"><h3 className="font-black">Agendamentos vinculados</h3><div className="mt-3 space-y-2">{relatedAppointments.length ? relatedAppointments.map((link) => <div key={link.agendamento_id} className="rounded-lg border border-neutral-200 p-3 text-sm"><strong>{dateTime(link.agendamentos?.inicio)}</strong><p className="text-xs text-neutral-500">{link.agendamentos?.status} · {money(link.agendamentos?.valor)}</p></div>) : <p className="text-sm text-neutral-500">Nenhum agendamento vinculado.</p>}</div></section>
      <section className="mt-7 pb-10"><h3 className="font-black">Linha do tempo</h3><div className="mt-3 space-y-3 border-l border-neutral-200 pl-4">{relatedEvents.map((event) => <div key={event.id}><p className="text-sm font-bold">{event.event_type.replaceAll("_", " ")}</p><p className="text-xs text-neutral-500">{dateTime(event.occurred_at)}</p></div>)}</div></section>
    </aside>
  </div>;
}

function Mini({ label, value }) { return <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">{label}</p><strong className="mt-1 block capitalize">{value}</strong></div>; }

export function CrmBoard({ workspace }) {
  const [items, setItems] = useState(workspace.opportunities);
  const [view, setView] = useState("board");
  const [query, setQuery] = useState("");
  const [activeStage, setActiveStage] = useState(workspace.stages.find((stage) => stage.tipo === "open")?.id || workspace.stages[0]?.id);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const filtered = useMemo(() => { const term = query.trim().toLowerCase(); return term ? items.filter((item) => [item.nome, item.titulo, item.telefone, item.email].some((value) => String(value || "").toLowerCase().includes(term))) : items; }, [items, query]);
  const selected = items.find((item) => item.id === selectedId);

  function move(opportunityId, stageId, lostReasonId = null) {
    const before = items;
    const stage = workspace.stages.find((entry) => entry.id === stageId);
    if (stage?.tipo === "lost" && !lostReasonId) { setError("Informe o motivo da perda antes de mover a oportunidade."); return; }
    setError(""); setItems((current) => current.map((item) => item.id === opportunityId ? { ...item, stage_id: stageId } : item));
    startTransition(async () => { const result = await moveCrmOpportunityAction({ opportunityId, stageId, lostReasonId }); if (!result.ok) { setItems(before); setError(result.error || "Não foi possível mover a oportunidade."); } });
  }

  function onDragEnd({ active, over }) {
    if (!over) return;
    const target = over.data.current?.type === "stage" ? over.data.current.stageId : over.data.current?.stageId;
    if (!target || target === active.data.current?.stageId) return;
    const stage = workspace.stages.find((entry) => entry.id === target);
    if (stage?.tipo === "lost") { setSelectedId(String(active.id)); setError("Abra a oportunidade e informe o motivo da perda."); return; }
    move(String(active.id), target);
  }

  return <>
    <div className="mt-6 flex gap-3 overflow-x-auto pb-2">
      <Metric icon={Target} label="Em aberto" value={workspace.metrics.openCount} detail={money(workspace.metrics.pipelineValue)} />
      <Metric icon={CircleDollarSign} label="Valor ponderado" value={money(workspace.metrics.weightedValue)} detail="considerando probabilidade" />
      <Metric icon={Check} label="Conversão" value={`${workspace.metrics.conversionRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} detail={`${workspace.metrics.wonCount} ganhos`} />
      <Metric icon={Activity} label="Follow-ups vencidos" value={workspace.metrics.overdueActivities} detail={`${workspace.metrics.withoutNextActivity} sem próxima ação`} />
    </div>
    <section className="premium-panel mt-5 rounded-lg p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md"><Search size={17} className="absolute left-3 top-3 text-neutral-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="dashboard-field h-11 w-full rounded-lg border border-neutral-200 pl-10 pr-3" placeholder="Buscar contato, telefone ou oportunidade" /></div>
        <div className="flex flex-wrap gap-2"><div className="inline-flex rounded-lg border border-neutral-200 bg-white p-1"><button onClick={() => setView("board")} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-bold ${view === "board" ? "bg-neutral-950 text-white" : "text-neutral-600"}`}><KanbanSquare size={15} /> Kanban</button><button onClick={() => setView("list")} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-bold ${view === "list" ? "bg-neutral-950 text-white" : "text-neutral-600"}`}><List size={15} /> Lista</button></div><Link href="/dashboard/crm/configuracoes" className="inline-flex h-11 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-bold"><Settings2 size={16} /> Configurar</Link><button onClick={() => setCreating(true)} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--clinic-primary)] px-4 text-sm font-bold text-white"><Plus size={16} /> Nova oportunidade</button></div>
      </div>
      {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{error}</p> : null}
    </section>
    {view === "board" ? <>
      <div className="mt-5 flex gap-2 overflow-x-auto pb-2 lg:hidden">{workspace.stages.map((stage) => <button key={stage.id} onClick={() => setActiveStage(stage.id)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${activeStage === stage.id ? "border-transparent text-white" : "border-neutral-200 bg-white"}`} style={activeStage === stage.id ? { backgroundColor: stage.cor } : {}}>{stage.nome} ({filtered.filter((item) => item.stage_id === stage.id).length})</button>)}</div>
      <div className="mt-4 lg:hidden">{workspace.stages.filter((stage) => stage.id === activeStage).map((stage) => <div key={stage.id} className="space-y-3">{filtered.filter((item) => item.stage_id === stage.id).map((item) => <OpportunityCard key={item.id} item={item} stage={stage} owner={workspace.members.find((member) => member.user_id === item.responsavel_id)} onOpen={setSelectedId} />)}</div>)}</div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}><div className="mt-5 hidden w-full gap-3 overflow-x-auto pb-5 lg:flex">{workspace.stages.map((stage) => <StageColumn key={stage.id} stage={stage} items={filtered.filter((item) => item.stage_id === stage.id)} members={workspace.members} onOpen={setSelectedId} />)}</div></DndContext>
    </> : <div className="premium-panel mt-5 overflow-x-auto rounded-lg"><table className="min-w-[900px] w-full text-left text-sm"><thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="p-4">Oportunidade</th><th className="p-4">Contato</th><th className="p-4">Etapa</th><th className="p-4">Responsável</th><th className="p-4">Valor</th><th className="p-4">Próxima ação</th><th className="p-4"></th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="border-b border-neutral-100"><td className="p-4 font-black">{item.titulo}</td><td className="p-4">{item.nome}</td><td className="p-4">{workspace.stages.find((stage) => stage.id === item.stage_id)?.nome}</td><td className="p-4">{workspace.members.find((member) => member.user_id === item.responsavel_id)?.nome || "-"}</td><td className="p-4">{money(item.valor_estimado)}</td><td className="p-4">{dateTime(item.next_activity_at)}</td><td className="p-4"><button onClick={() => setSelectedId(item.id)} className="inline-flex items-center gap-1 font-bold text-[var(--clinic-primary)]">Abrir <ChevronRight size={15} /></button></td></tr>)}</tbody></table></div>}
    {creating ? <NewOpportunityModal pipelineId={workspace.selectedPipelineId} stages={workspace.stages} members={workspace.members} procedures={workspace.procedures} onClose={() => setCreating(false)} /> : null}
    {selected ? <OpportunityDrawer item={selected} stages={workspace.stages} members={workspace.members} procedures={workspace.procedures} activities={workspace.activities} events={workspace.events} appointments={workspace.appointments} lostReasons={workspace.lostReasons} onClose={() => setSelectedId(null)} onMove={move} /> : null}
  </>;
}
