"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInAction } from "./actions";

const initialState = { ok: true, message: "" };

function SubmitButton({ label = "Entrar", pendingLabel = "Entrando..." }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-11 w-full rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      type="submit"
      disabled={pending}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export default function LoginForm({ mode = "cliente", next = "/dashboard", emailPlaceholder = "voce@clinica.com", submitLabel = "Entrar" }) {
  const [state, formAction] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">E-mail</span>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 outline-none transition focus:border-emerald-600"
          type="email"
          name="email"
          autoComplete="email"
          placeholder={emailPlaceholder}
          required
        />
      </label>
      <label className="block">
        <span className="flex items-center justify-between gap-3 text-sm font-medium text-neutral-700">
          Senha
          {mode === "admin" ? (
            <Link href="/login/recuperar-senha" className="text-xs font-bold text-[#ed7009] hover:text-[#cf5f07]">
              Esqueci minha senha
            </Link>
          ) : null}
        </span>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 outline-none transition focus:border-emerald-600"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="********"
          required
        />
      </label>

      {!state?.ok && state?.message ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {state.message}
        </p>
      ) : null}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
