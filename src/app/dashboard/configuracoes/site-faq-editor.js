"use client";

import { ChevronDown, ChevronUp, HelpCircle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    key: `faq-${index}`,
    pergunta: String(item?.pergunta || ""),
    resposta: String(item?.resposta || ""),
  }));
}

export function SiteFaqEditor({ defaultItems = [] }) {
  const [items, setItems] = useState(() => normalizeItems(defaultItems));

  function updateItem(key, field, value) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    setItems((current) => {
      if (current.length >= 20) return current;
      return [...current, { key: `faq-${Date.now()}`, pergunta: "", resposta: "" }];
    });
  }

  function removeItem(key) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  function moveItem(index, direction) {
    setItems((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const serialized = JSON.stringify(items.map(({ pergunta, resposta }) => ({ pergunta, resposta })));

  return (
    <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5">
      <input type="hidden" name="site_faq_items" value={serialized} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <HelpCircle size={19} className="text-[var(--clinic-primary)]" />
            <h3 className="font-bold text-neutral-900">Perguntas frequentes</h3>
          </div>
          <p className="mt-1 text-sm leading-6 text-neutral-600">Organize as principais dúvidas que serão exibidas no site da clínica.</p>
        </div>
        <button
          type="button"
          onClick={addItem}
          disabled={items.length >= 20}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--clinic-primary)] px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Plus size={17} /> Adicionar pergunta
        </button>
      </div>

      <div className="mt-5 grid gap-4">
        {items.length ? items.map((item, index) => (
          <div key={item.key} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--clinic-primary)]">Pergunta {index + 1}</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveItem(index, -1)} disabled={index === 0} className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-25" aria-label="Mover pergunta para cima"><ChevronUp size={17} /></button>
                <button type="button" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1} className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-25" aria-label="Mover pergunta para baixo"><ChevronDown size={17} /></button>
                <button type="button" onClick={() => removeItem(item.key)} className="flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition hover:bg-red-50" aria-label="Remover pergunta"><Trash2 size={16} /></button>
              </div>
            </div>
            <label className="mt-3 block">
              <span className="text-sm font-medium text-neutral-700">Pergunta</span>
              <input value={item.pergunta} onChange={(event) => updateItem(item.key, "pergunta", event.target.value)} maxLength={180} className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-[var(--clinic-primary)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--clinic-primary)_10%,transparent)]" placeholder="Ex.: Como funciona a avaliação inicial?" />
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-medium text-neutral-700">Resposta</span>
              <textarea value={item.resposta} onChange={(event) => updateItem(item.key, "resposta", event.target.value)} maxLength={1200} rows={4} className="mt-2 w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm leading-6 text-neutral-900 outline-none transition focus:border-[var(--clinic-primary)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--clinic-primary)_10%,transparent)]" placeholder="Escreva uma resposta clara e objetiva." />
            </label>
          </div>
        )) : (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-5 py-8 text-center">
            <HelpCircle className="mx-auto text-neutral-400" size={28} />
            <p className="mt-3 text-sm font-bold text-neutral-800">Nenhuma pergunta cadastrada</p>
            <p className="mt-1 text-xs text-neutral-500">Adicione a primeira pergunta para publicar o FAQ.</p>
          </div>
        )}
      </div>
    </div>
  );
}
