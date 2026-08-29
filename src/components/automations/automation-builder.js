"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Beaker, Clock3, Copy, GitBranch, Plus, ShieldQuestion, Trash2, Zap } from "lucide-react";
import { dryRunAutomation } from "@/lib/automations/compiler.mjs";
import { ACTION_REGISTRY } from "@/lib/automations/registry/actions.mjs";
import { EVENT_REGISTRY } from "@/lib/automations/registry/events.mjs";
import { OPERATOR_REGISTRY } from "@/lib/automations/registry/operators.mjs";

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyGroup() {
  return { kind: "group", operator: "AND", conditions: [] };
}

function newActionStep(prefix = "action") {
  return {
    id: uid(prefix),
    type: "action",
    actionType: "internal.create_notification",
    params: { title: "Notificação", message: "Revise esta ocorrência." },
  };
}

function Input({ className = "", ...props }) {
  return <input {...props} className={`dashboard-field min-h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm ${className}`} />;
}

function Select({ className = "", ...props }) {
  return <select {...props} className={`dashboard-field min-h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm ${className}`} />;
}

function ConditionGroupEditor({ group, event, onChange, compact = false }) {
  const conditions = group?.conditions || [];
  const fieldMap = useMemo(
    () => Object.fromEntries((event?.fields || []).map((item) => [item.path, item])),
    [event],
  );

  function updateCondition(index, patch) {
    onChange({
      ...(group || emptyGroup()),
      conditions: conditions.map((item, current) => current === index ? { ...item, ...patch } : item),
    });
  }

  function addCondition() {
    const first = event?.fields?.[0];
    if (!first) return;
    onChange({
      ...(group || emptyGroup()),
      conditions: [
        ...conditions,
        { kind: "predicate", field: first.path, operator: "equals", valueType: first.type, value: "" },
      ],
    });
  }

  return <div className={compact ? "space-y-2" : "mt-4 space-y-3"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-bold text-neutral-500">{conditions.length ? "Regras configuradas" : "Sem condição: sempre continua"}</span>
      <Select aria-label="Operador do grupo" value={group?.operator || "AND"} onChange={(changeEvent) => onChange({ ...(group || emptyGroup()), operator: changeEvent.target.value })}>
        <option value="AND">Todas (E)</option><option value="OR">Qualquer uma (OU)</option>
      </Select>
    </div>

    {conditions.map((condition, index) => {
      const selectedField = fieldMap[condition.field] || event?.fields?.[0];
      const hasValue = !["is_empty", "is_not_empty"].includes(condition.operator);
      return <div key={`${condition.field}-${index}`} className="grid gap-2 rounded-lg border border-neutral-200 bg-white/70 p-3 lg:grid-cols-[1.3fr_1fr_1fr_auto]">
        <Select aria-label="Campo" value={condition.field} onChange={(changeEvent) => {
          const next = fieldMap[changeEvent.target.value];
          updateCondition(index, { field: changeEvent.target.value, valueType: next?.type || "string" });
        }}>
          {(event?.fields || []).map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}
        </Select>
        <Select aria-label="Operador" value={condition.operator} onChange={(changeEvent) => updateCondition(index, { operator: changeEvent.target.value })}>
          {Object.values(OPERATOR_REGISTRY).filter((item) => item.types.includes(selectedField?.type || "string")).map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
        </Select>
        {hasValue ? <Input aria-label="Valor" value={Array.isArray(condition.value) ? condition.value.join(",") : condition.value ?? ""} onChange={(changeEvent) => updateCondition(index, {
          value: ["in", "not_in", "between"].includes(condition.operator) ? changeEvent.target.value.split(",").map((item) => item.trim()) : changeEvent.target.value,
        })} /> : <div />}
        <button type="button" title="Remover condição" onClick={() => onChange({ ...(group || emptyGroup()), conditions: conditions.filter((_, current) => current !== index) })} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 text-red-600"><Trash2 size={17} /></button>
      </div>;
    })}

    <button type="button" onClick={addCondition} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-bold"><Plus size={16} /> Condição</button>
  </div>;
}

function ActionEditor({ step, onChange }) {
  const action = ACTION_REGISTRY[step.actionType];
  return <div className="mt-3 space-y-3">
    <Select aria-label="Ação" value={step.actionType} onChange={(event) => onChange({ actionType: event.target.value, params: {} })} className="w-full">
      {Object.values(ACTION_REGISTRY).map((item) => <option key={item.type} value={item.type}>{item.module} · {item.label}</option>)}
    </Select>
    <div className="grid gap-2 sm:grid-cols-2">
      {(action?.parameters || []).map((parameter) => <label key={parameter.name} className="text-xs font-bold text-neutral-600">
        {parameter.label}
        {parameter.type === "enum" ? <Select value={step.params?.[parameter.name] || ""} onChange={(event) => onChange({ params: { ...step.params, [parameter.name]: event.target.value } })} className="mt-1 w-full">
          <option value="">Selecione</option>{(parameter.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </Select> : <Input type={["number", "money"].includes(parameter.type) ? "number" : "text"} value={step.params?.[parameter.name] ?? ""} onChange={(event) => onChange({
          params: { ...step.params, [parameter.name]: ["number", "money"].includes(parameter.type) ? Number(event.target.value) : event.target.value },
        })} className="mt-1 w-full" />}
      </label>)}
    </div>
    {action ? <p className="text-xs text-neutral-500">Risco: {action.risk} · idempotência: {action.idempotency}</p> : null}
  </div>;
}

function BranchEditor({ step, event, onChange }) {
  function branchSelect(key, prefix) {
    return <Select value={step[key]?.[0]?.actionType || "internal.create_notification"} onChange={(changeEvent) => onChange({
      [key]: [{ id: step[key]?.[0]?.id || uid(prefix), type: "action", actionType: changeEvent.target.value, params: {} }],
    })} className="mt-1 w-full">
      {Object.values(ACTION_REGISTRY).map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
    </Select>;
  }

  return <div className="mt-3 space-y-3 rounded-lg bg-neutral-50 p-3">
    <ConditionGroupEditor compact group={step.conditions} event={event} onChange={(conditions) => onChange({ conditions })} />
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-xs font-bold text-neutral-600">Se verdadeiro{branchSelect("then", "then")}</label>
      <label className="text-xs font-bold text-neutral-600">Senão{branchSelect("else", "else")}</label>
    </div>
    <p className="text-xs text-neutral-500">A primeira versão permite uma ação por ramo.</p>
  </div>;
}

function StepCard({ step, index, total, event, onChange, onMove, onDuplicate, onRemove }) {
  const labels = {
    action: ["Executar ação", <Zap key="action" size={18} />],
    wait: ["Aguardar", <Clock3 key="wait" size={18} />],
    condition: ["Revalidar condição", <ShieldQuestion key="condition" size={18} />],
    branch: ["Condição com senão", <GitBranch key="branch" size={18} />],
  };
  const [label, icon] = labels[step.type] || labels.action;

  return <div className="rounded-lg border border-neutral-200 bg-white/75 p-4">
    <div className="flex items-center gap-3">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--clinic-soft)] text-[var(--clinic-primary)]">{icon}</span>
      <strong className="flex-1">{label}</strong>
      <button type="button" title="Duplicar" onClick={onDuplicate}><Copy size={17} /></button>
      <button type="button" title="Subir" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={17} /></button>
      <button type="button" title="Descer" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={17} /></button>
      <button type="button" title="Remover" onClick={onRemove} className="text-red-600"><Trash2 size={17} /></button>
    </div>

    {step.type === "action" ? <ActionEditor step={step} onChange={onChange} /> : null}
    {step.type === "wait" ? <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <Select aria-label="Modo de espera" value={step.mode || "duration"} onChange={(eventValue) => onChange({ mode: eventValue.target.value })}>
        <option value="duration">Por duração</option><option value="until">Até data e hora</option>
      </Select>
      {step.mode === "until" ? <Input aria-label="Data e hora local" type="datetime-local" value={step.until || ""} onChange={(eventValue) => onChange({ until: eventValue.target.value })} className="sm:col-span-2" /> : <>
        <Input aria-label="Duração" type="number" min="1" value={step.amount} onChange={(eventValue) => onChange({ amount: Number(eventValue.target.value) })} />
        <Select aria-label="Unidade" value={step.unit} onChange={(eventValue) => onChange({ unit: eventValue.target.value })}>
          <option value="minutes">Minutos</option><option value="hours">Horas</option><option value="days">Dias</option>
        </Select>
      </>}
      <p className="text-xs text-neutral-500 sm:col-span-3">Datas absolutas usam o fuso configurado na clínica e são persistidas em UTC.</p>
    </div> : null}
    {step.type === "condition" ? <div className="mt-3 rounded-lg bg-neutral-50 p-3">
      <ConditionGroupEditor compact group={step.conditions} event={event} onChange={(conditions) => onChange({ conditions })} />
      <p className="mt-2 text-xs text-neutral-500">Se a condição não for atendida, a execução termina como ignorada.</p>
    </div> : null}
    {step.type === "branch" ? <BranchEditor step={step} event={event} onChange={onChange} /> : null}
  </div>;
}

export function AutomationBuilder({ automation, saveAction }) {
  const [definition, setDefinition] = useState(automation.draft_definition || {});
  const [timeline, setTimeline] = useState([]);
  const event = EVENT_REGISTRY[definition.trigger?.type] || Object.values(EVENT_REGISTRY)[0];
  const steps = definition.steps || [];

  function update(patch) {
    setDefinition((current) => ({ ...current, ...patch }));
  }

  function replaceStep(index, patch) {
    update({ steps: steps.map((item, current) => current === index ? { ...item, ...patch } : item) });
  }

  function moveStep(index, offset) {
    const destination = index + offset;
    if (destination < 0 || destination >= steps.length) return;
    const next = [...steps];
    [next[index], next[destination]] = [next[destination], next[index]];
    update({ steps: next });
  }

  function testDefinition() {
    try {
      setTimeline(dryRunAutomation(definition, { event: { payload: {} }, opportunity: {}, booking: {}, receivable: {} }).timeline);
    } catch (error) {
      setTimeline([{ status: "failed", message: error.details?.join(" ") || error.message }]);
    }
  }

  return <div className="space-y-5">
    <form action={saveAction} className="space-y-5">
      <input type="hidden" name="automation_id" value={automation.id} />
      <input type="hidden" name="current_status" value={automation.status} />
      <input type="hidden" name="definition_json" value={JSON.stringify(definition)} />

      <section className="premium-panel rounded-lg p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold">Nome<Input name="name" defaultValue={automation.name} required className="mt-2 w-full" /></label>
          <label className="text-sm font-bold">Descrição<Input name="description" defaultValue={automation.description || ""} className="mt-2 w-full" /></label>
        </div>
      </section>

      <section className="premium-panel rounded-lg p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--clinic-primary)]">Quando</p>
        <Select aria-label="Evento" value={event?.type || ""} onChange={(changeEvent) => update({ trigger: { type: changeEvent.target.value, reentry: "deny_self" }, conditions: emptyGroup() })} className="mt-3 w-full">
          <option value="">Selecione um evento</option>{Object.values(EVENT_REGISTRY).map((item) => <option key={item.type} value={item.type}>{item.module} · {item.label}</option>)}
        </Select>
        <p className="mt-2 text-sm text-neutral-500">{event?.description}</p>
      </section>

      <section className="premium-panel rounded-lg p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--clinic-primary)]">Se</p>
        <h2 className="mt-1 text-lg font-black">Condições iniciais</h2>
        <ConditionGroupEditor group={definition.conditions} event={event} onChange={(conditions) => update({ conditions })} />
      </section>

      <section className="premium-panel rounded-lg p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--clinic-primary)]">Então</p>
        <h2 className="mt-1 text-lg font-black">Etapas da automação</h2>
        <div className="mt-4 space-y-3">
          {steps.map((step, index) => <StepCard key={step.id} step={step} index={index} total={steps.length} event={event}
            onChange={(patch) => replaceStep(index, patch)} onMove={(offset) => moveStep(index, offset)}
            onDuplicate={() => update({ steps: [...steps.slice(0, index + 1), { ...structuredClone(step), id: uid(step.type || "step") }, ...steps.slice(index + 1)] })}
            onRemove={() => update({ steps: steps.filter((_, current) => current !== index) })} />)}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => update({ steps: [...steps, newActionStep()] })} className="inline-flex items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-bold text-white"><Plus size={16} /> Ação</button>
          <button type="button" onClick={() => update({ steps: [...steps, { id: uid("wait"), type: "wait", mode: "duration", amount: 10, unit: "minutes", until: null }] })} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-bold"><Clock3 size={16} /> Espera</button>
          <button type="button" onClick={() => update({ steps: [...steps, { id: uid("condition"), type: "condition", conditions: emptyGroup() }] })} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-bold"><ShieldQuestion size={16} /> Revalidar</button>
          <button type="button" onClick={() => update({ steps: [...steps, { id: uid("branch"), type: "branch", conditions: emptyGroup(), then: [newActionStep("then")], else: [newActionStep("else")] }] })} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-bold"><GitBranch size={16} /> Se / senão</button>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={testDefinition} className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-5 py-3 font-bold"><Beaker size={18} /> Testar sem executar</button>
        <button type="submit" className="rounded-lg bg-neutral-950 px-6 py-3 font-bold text-white">Salvar rascunho</button>
      </div>
    </form>

    {timeline.length ? <section className="premium-panel rounded-lg p-5">
      <h2 className="text-lg font-black">Resultado do teste</h2>
      <div className="mt-4 space-y-2">{timeline.map((item, index) => <div key={`${item.stepId || item.type}-${index}`} className="rounded-lg border border-neutral-200 bg-white/75 p-3 text-sm">
        <strong className={item.status === "failed" ? "text-red-700" : "text-neutral-900"}>{item.status === "failed" ? "Falha" : item.status === "skipped" ? "Simulação" : "OK"}</strong>
        <span className="ml-2 text-neutral-600">{item.message}</span>
      </div>)}</div>
    </section> : null}
  </div>;
}
