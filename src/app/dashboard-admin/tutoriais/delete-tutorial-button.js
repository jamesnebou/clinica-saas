"use client";

import { Trash2 } from "lucide-react";
import { deleteClinicTutorialAction } from "@/app/admin/actions";

export function DeleteTutorialButton({ id, title }) {
  return (
    <form
      action={deleteClinicTutorialAction}
      onSubmit={(event) => {
        if (!window.confirm(`Excluir o tutorial "${title}"? Esta ação não pode ser desfeita.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700 transition hover:bg-red-100"
      >
        <Trash2 size={15} />
        Excluir
      </button>
    </form>
  );
}
