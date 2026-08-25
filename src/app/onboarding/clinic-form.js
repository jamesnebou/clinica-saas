"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createClinicAction } from "./actions";
import { SEGMENT_OPTIONS } from "@/lib/segments/registry";

const initialState = { ok: true, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-11 rounded-lg bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      type="submit"
      disabled={pending}
    >
      {pending ? "Criando clínica..." : "Criar clínica"}
    </button>
  );
}

export default function ClinicForm({ userEmail }) {
  const [state, formAction] = useActionState(createClinicAction, initialState);

  return (
    <form action={formAction} className="mt-6 grid gap-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Nome da clínica</span>
        <input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-600" name="nome" required placeholder="Ex: Clínica Bella Skin" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Identificador</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-600" name="slug" placeholder="clinica-bella-skin" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">CNPJ/CPF</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-600" name="documento" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">E-mail</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-600" name="email" type="email" defaultValue={userEmail || ""} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Telefone</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-600" name="telefone" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Cidade</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none focus:border-emerald-600" name="cidade" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">UF</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm uppercase outline-none focus:border-emerald-600" name="estado" maxLength={2} />
        </label>
      </div>

      <fieldset className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-4">
        <legend className="px-1 text-sm font-semibold text-neutral-800">Segmentos da clínica</legend>
        <label className="mt-2 block">
          <span className="text-sm font-medium text-neutral-700">Segmento principal</span>
          <select name="segmento_principal" defaultValue="estetica" className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-emerald-600">
            {SEGMENT_OPTIONS.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
        </label>
        <div className="mt-4">
          <p className="text-sm font-medium text-neutral-700">Segmentos adicionais <span className="font-normal text-neutral-500">(opcional)</span></p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {SEGMENT_OPTIONS.map((item) => (
              <label key={item.slug} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">
                <input type="checkbox" name="segmentos_adicionais" value={item.slug} />
                {item.name}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-neutral-500">Se um segmento também for escolhido como principal, ele será salvo apenas uma vez.</p>
        </div>
      </fieldset>

      {!state?.ok && state?.message ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{state.message}</p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
