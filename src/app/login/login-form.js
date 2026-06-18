"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInAction } from "./actions";

const initialState = { ok: true, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-11 w-full rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      type="submit"
      disabled={pending}
    >
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">E-mail</span>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 outline-none transition focus:border-emerald-600"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="voce@clinica.com"
          required
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Senha</span>
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

      <SubmitButton />
    </form>
  );
}
