"use client";

import { Fragment, useRef, useState } from "react";
import { Bold, Italic, List, Pilcrow } from "lucide-react";

function renderInline(text) {
  return String(text || "").split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-black text-neutral-950">{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }

    return <Fragment key={index}>{part}</Fragment>;
  });
}

function Preview({ text }) {
  const blocks = String(text || "").split(/\n{2,}/).filter(Boolean);

  if (!blocks.length) {
    return <p className="text-sm text-neutral-400">A prévia da biografia aparece aqui.</p>;
  }

  return (
    <div className="space-y-4 text-sm leading-7 text-neutral-700">
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").filter(Boolean);
        const isList = lines.length > 0 && lines.every((line) => line.trim().startsWith("- "));

        if (isList) {
          return (
            <ul key={blockIndex} className="list-disc space-y-2 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderInline(line.trim().replace(/^- /, ""))}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIndex}>
            {lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex ? <br /> : null}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function BioEditor({ label, name, defaultValue = "", placeholder = "" }) {
  const textareaRef = useRef(null);
  const [value, setValue] = useState(defaultValue || "");

  function updateSelection(nextValue, nextStart, nextEnd = nextStart) {
    setValue(nextValue);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextStart, nextEnd);
    });
  }

  function wrapSelection(before, after = before, fallback = "texto em destaque") {
    const field = textareaRef.current;
    if (!field) return;

    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const nextValue = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    updateSelection(nextValue, start + before.length, start + before.length + selected.length);
  }

  function insertParagraph() {
    const field = textareaRef.current;
    if (!field) return;

    const start = field.selectionStart;
    const end = field.selectionEnd;
    const nextValue = `${value.slice(0, start)}\n\n${value.slice(end)}`;
    updateSelection(nextValue, start + 2);
  }

  function insertList() {
    const field = textareaRef.current;
    if (!field) return;

    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = value.slice(start, end);
    const listText = selected
      ? selected.split("\n").map((line) => line.trim() ? `- ${line.replace(/^- /, "")}` : line).join("\n")
      : "- Primeiro diferencial\n- Segundo diferencial";
    const nextValue = `${value.slice(0, start)}${listText}${value.slice(end)}`;
    updateSelection(nextValue, start, start + listText.length);
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">{label}</span>
        <div className="mt-2 flex flex-wrap gap-2 rounded-t-lg border border-b-0 border-neutral-200 bg-neutral-50 p-2">
          <button type="button" onClick={() => wrapSelection("**", "**", "texto em negrito")} className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-800 shadow-sm">
            <Bold size={15} /> Negrito
          </button>
          <button type="button" onClick={() => wrapSelection("*", "*", "texto em itálico")} className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-800 shadow-sm">
            <Italic size={15} /> Itálico
          </button>
          <button type="button" onClick={insertParagraph} className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-800 shadow-sm">
            <Pilcrow size={15} /> Novo parágrafo
          </button>
          <button type="button" onClick={insertList} className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-800 shadow-sm">
            <List size={15} /> Lista
          </button>
        </div>
        <textarea
          ref={textareaRef}
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className="min-h-56 w-full rounded-b-lg border border-neutral-200 bg-white px-3 py-3 text-sm leading-6 outline-none transition placeholder:text-neutral-400 focus:border-[var(--clinic-primary)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--clinic-primary)_12%,transparent)] focus:ring-0"
        />
      </label>
      <div className="rounded-lg border border-neutral-200 bg-white/75 p-4">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-neutral-400">Prévia</p>
        <Preview text={value} />
      </div>
    </div>
  );
}
