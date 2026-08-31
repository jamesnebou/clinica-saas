"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestClientPasswordResetAction, updateClientRecoveredPasswordAction } from "@/app/login/actions";

const initialState = { ok: true, message: "" };

function SubmitButton({ children, pendingLabel }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="h-11 w-full rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60">{pending ? pendingLabel : children}</button>;
}

export function ClientPasswordResetRequestForm() {
  const [state, formAction] = useActionState(requestClientPasswordResetAction, initialState);
  return (
    <form action={formAction} className="mt-6 space-y-4">
      <label className="block"><span className="text-sm font-medium text-neutral-700">E-mail da conta</span><input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 outline-none focus:border-[#ed7009]" type="email" name="email" autoComplete="email" required /></label>
      {state?.message ? <p className={`rounded-lg border px-3 py-2 text-sm font-medium ${state.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{state.message}</p> : null}
      <SubmitButton pendingLabel="Enviando...">Enviar link de recuperação</SubmitButton>
      <Link href="/login-cliente" className="block text-center text-sm font-semibold text-neutral-500">Voltar ao login</Link>
    </form>
  );
}

export function ClientPasswordUpdateForm() {
  const [state, formAction] = useActionState(updateClientRecoveredPasswordAction, initialState);
  return (
    <form action={formAction} className="mt-6 space-y-4">
      <label className="block"><span className="text-sm font-medium text-neutral-700">Nova senha</span><input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 outline-none focus:border-[#ed7009]" type="password" name="password" autoComplete="new-password" minLength={8} required /></label>
      <label className="block"><span className="text-sm font-medium text-neutral-700">Confirmar nova senha</span><input className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3 outline-none focus:border-[#ed7009]" type="password" name="password_confirm" autoComplete="new-password" minLength={8} required /></label>
      {!state?.ok && state?.message ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{state.message}</p> : null}
      <SubmitButton pendingLabel="Salvando...">Salvar nova senha</SubmitButton>
    </form>
  );
}
