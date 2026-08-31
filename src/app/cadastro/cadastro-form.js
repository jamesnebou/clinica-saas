"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MarketingAttributionHiddenFields } from "@/components/marketing/attribution-hidden-fields";
import { signUpAction } from "./actions";

const initialState = { ok: true, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-12 w-full rounded-lg bg-neutral-950 px-5 text-sm font-bold text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
      {pending ? "Criando sua conta..." : "Criar minha conta"}
    </button>
  );
}

export default function CadastroForm({ selectedPlan }) {
  const [state, formAction] = useActionState(signUpAction, initialState);

  if (state?.ok && state?.requiresEmailConfirmation) {
    return (
      <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="font-black">Confira seu e-mail</p>
        <p className="mt-2 leading-6">{state.message}</p>
        <Link href="/login-cliente" className="mt-4 inline-flex font-bold underline">Voltar ao login</Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <MarketingAttributionHiddenFields pageType="self_service_signup" includeRegistrationEvent={false} includeSession />
      <input type="hidden" name="selected_plan" value={selectedPlan} />
      <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        Site
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-neutral-700">Nome completo</span>
        <input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none transition focus:border-[#ed7009]" name="name" autoComplete="name" required maxLength={120} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-neutral-700">E-mail</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none transition focus:border-[#ed7009]" name="email" type="email" autoComplete="email" required maxLength={320} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-neutral-700">WhatsApp</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none transition focus:border-[#ed7009]" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(77) 99999-9999" required maxLength={20} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-neutral-700">Senha</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none transition focus:border-[#ed7009]" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-neutral-700">Confirmar senha</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none transition focus:border-[#ed7009]" name="password_confirm" type="password" autoComplete="new-password" minLength={8} required />
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-600">
        <input className="mt-1 h-4 w-4 shrink-0 accent-[#ed7009]" type="checkbox" name="terms" required />
        <span>
          Li e aceito os <Link className="font-bold text-neutral-900 underline" href="/termos" target="_blank">Termos de Uso</Link> e a <Link className="font-bold text-neutral-900 underline" href="/privacidade" target="_blank">Política de Privacidade</Link>.
        </span>
      </label>

      {state?.message ? (
        <p className={`rounded-lg border px-3 py-2 text-sm font-semibold ${state.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{state.message}</p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
