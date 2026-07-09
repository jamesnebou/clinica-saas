"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestAdminPasswordResetAction, updateRecoveredPasswordAction } from "./actions";

const initialState = { ok: true, message: "" };

function SubmitButton({ label, pendingLabel }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function RequestPasswordResetForm() {
  const [state, formAction] = useActionState(requestAdminPasswordResetAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">E-mail administrativo</span>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 outline-none transition focus:border-[#ed7009]"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="admin@seudominio.com"
          required
        />
      </label>

      {state?.message ? (
        <p className={`rounded-lg border px-3 py-2 text-sm font-medium ${state.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {state.message}
        </p>
      ) : null}

      <SubmitButton label="Enviar link de recuperação" pendingLabel="Enviando..." />
      <Link href="/login" className="block text-center text-sm font-semibold text-neutral-500 hover:text-neutral-900">
        Voltar para o login
      </Link>
    </form>
  );
}

export function UpdateRecoveredPasswordForm() {
  const [state, formAction] = useActionState(updateRecoveredPasswordAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Nova senha</span>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 outline-none transition focus:border-[#ed7009]"
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="Mínimo de 8 caracteres"
          required
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Confirmar nova senha</span>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 outline-none transition focus:border-[#ed7009]"
          type="password"
          name="password_confirm"
          autoComplete="new-password"
          placeholder="Repita a nova senha"
          required
        />
      </label>

      {!state?.ok && state?.message ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {state.message}
        </p>
      ) : null}

      <SubmitButton label="Salvar nova senha" pendingLabel="Salvando..." />
    </form>
  );
}
