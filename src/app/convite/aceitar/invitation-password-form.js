"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { acceptStaffInvitationAction } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="h-11 w-full rounded-lg bg-neutral-950 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Salvando..." : "Definir senha e entrar"}</button>;
}

export function InvitationPasswordForm({ id }) {
  const [state, action] = useActionState(acceptStaffInvitationAction, { ok: true, message: "" });
  return <form action={action} className="mt-5 space-y-4">
    <input type="hidden" name="id" value={id} />
    <label className="block text-sm font-medium">Nova senha<input name="password" type="password" autoComplete="new-password" minLength={8} required className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" /></label>
    <label className="block text-sm font-medium">Confirmar senha<input name="password_confirm" type="password" autoComplete="new-password" minLength={8} required className="mt-2 h-11 w-full rounded-lg border border-neutral-200 px-3" /></label>
    {!state?.ok && state?.message ? <p role="alert" className="text-sm text-red-700">{state.message}</p> : null}
    <Submit />
  </form>;
}
