"use client";

import { useState, useTransition } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { reorderPipelineStagesAction, updatePipelineStageAction } from "@/app/dashboard/crm/actions";

function Stage({ stage }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: stage.id });
  return <form ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} action={updatePipelineStageAction} className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-3 md:grid-cols-[auto_1.4fr_100px_120px_190px_auto] md:items-end">
    <input type="hidden" name="stage_id" value={stage.id} />
    <button ref={setActivatorNodeRef} {...attributes} {...listeners} type="button" className="inline-flex h-10 w-10 touch-none items-center justify-center rounded-lg border border-neutral-200 text-neutral-500" title="Reordenar"><GripVertical size={17} /></button>
    <label><span className="text-xs font-bold text-neutral-500">Nome</span><input className="dashboard-field mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3" name="nome" defaultValue={stage.nome} /></label>
    <label><span className="text-xs font-bold text-neutral-500">Cor</span><input className="dashboard-field mt-1 h-10 w-full rounded-lg border border-neutral-200 px-2" name="cor" type="color" defaultValue={stage.cor} /></label>
    <label><span className="text-xs font-bold text-neutral-500">Probabilidade</span><input className="dashboard-field mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3" name="probabilidade" type="number" min="0" max="100" defaultValue={stage.probabilidade} /></label>
    <label><span className="text-xs font-bold text-neutral-500">Tipo</span><select className="dashboard-field mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3" name="tipo" defaultValue={stage.tipo}><option value="open">Em aberto</option><option value="won">Ganho</option><option value="lost">Perdido</option></select></label>
    <button className="h-10 rounded-lg border border-neutral-300 px-4 text-sm font-bold">Salvar</button>
  </form>;
}

export function PipelineStageList({ initialStages, pipelineId }) {
  const [stages, setStages] = useState(initialStages);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  function dragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const previous = stages;
    const next = arrayMove(stages, stages.findIndex((item) => item.id === active.id), stages.findIndex((item) => item.id === over.id));
    setStages(next);
    startTransition(async () => { const result = await reorderPipelineStagesAction(next.map((item) => item.id), pipelineId); if (!result.ok) { setStages(previous); setError(result.error || "Não foi possível reordenar as etapas."); } });
  }
  return <div>{error ? <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={stages.map((item) => item.id)} strategy={verticalListSortingStrategy}><div className="space-y-2">{stages.map((stage) => <Stage key={stage.id} stage={stage} />)}</div></SortableContext></DndContext></div>;
}
