"use client";

import { useFormStatus } from "react-dom";
import { AlertTriangle, Trash2 } from "lucide-react";
import { deleteClinicAction } from "../../admin/actions";

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
    >
      <Trash2 aria-hidden="true" size={17} />
      {pending ? "Excluindo..." : "Excluir clínica"}
    </button>
  );
}

export function ClinicDeleteForm({ clinicId, clinicName, isProtected = false }) {
  if (isProtected) {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Exclusão bloqueada:</strong> a demonstração oficial é protegida para preservar o ambiente comercial.
      </div>
    );
  }

  function confirmDeletion(event) {
    const formData = new FormData(event.currentTarget);
    const typedName = String(formData.get("confirm_name") || "").trim();
    const scope = String(formData.get("delete_scope") || "clinic");

    if (typedName !== clinicName.trim()) {
      event.preventDefault();
      window.alert("Digite exatamente o nome da clínica para confirmar.");
      return;
    }

    const scopeDescription = scope === "full"
      ? "a clínica, todos os seus dados e as contas de acesso que não pertencem a outra clínica"
      : "a clínica e todos os seus dados, preservando as contas de acesso";

    if (!window.confirm(`Confirma a exclusão definitiva de ${scopeDescription}? Esta ação não pode ser desfeita.`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={deleteClinicAction} onSubmit={confirmDeletion} className="mt-4 space-y-4 rounded-lg border border-red-200 bg-red-50 p-4">
      <input type="hidden" name="clinica_id" value={clinicId} />
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-red-700" size={20} />
        <div>
          <h3 className="font-black text-red-950">Zona de exclusão</h3>
          <p className="mt-1 text-sm leading-6 text-red-900">A assinatura recorrente será cancelada e os dados da clínica serão removidos definitivamente.</p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-bold text-red-950">O que deseja excluir?</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-red-200 bg-white p-3">
          <input className="mt-1" type="radio" name="delete_scope" value="clinic" defaultChecked />
          <span>
            <strong className="block text-sm text-neutral-950">Somente do sistema</strong>
            <span className="text-xs leading-5 text-neutral-600">Exclui a clínica e seus dados, mas preserva os usuários no Supabase Auth.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-red-200 bg-white p-3">
          <input className="mt-1" type="radio" name="delete_scope" value="full" />
          <span>
            <strong className="block text-sm text-neutral-950">Exclusão geral</strong>
            <span className="text-xs leading-5 text-neutral-600">Também exclui contas Auth exclusivas desta clínica. Usuários vinculados a outras clínicas são preservados.</span>
          </span>
        </label>
      </fieldset>

      <label className="block text-sm font-bold text-red-950">
        Digite <span className="select-all">{clinicName}</span> para confirmar
        <input
          type="text"
          name="confirm_name"
          required
          autoComplete="off"
          className="mt-2 min-h-11 w-full rounded-lg border border-red-300 bg-white px-3 py-2 font-normal text-neutral-950 outline-none focus:border-red-700 focus:ring-2 focus:ring-red-200"
        />
      </label>

      <DeleteButton />
    </form>
  );
}
