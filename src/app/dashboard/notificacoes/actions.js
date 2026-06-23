"use server";

import { revalidatePath } from "next/cache";
import { requireClinicSection } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

function text(formData, key) {
  return String(formData.get(key) || "").trim();
}

export async function markNotificationViewedAction(formData) {
  const { activeClinic } = await requireClinicSection("notificacoes");
  const id = text(formData, "id");

  if (!activeClinic?.id || !id) return;

  const { error } = await supabaseAdmin
    .from("site_agendamentos_publicos")
    .update({ visualizado_em: new Date().toISOString() })
    .eq("id", id)
    .eq("clinica_id", activeClinic.id);

  if (error) return;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/notificacoes");
}

export async function markAllNotificationsViewedAction() {
  const { activeClinic } = await requireClinicSection("notificacoes");

  if (!activeClinic?.id) return;

  const { error } = await supabaseAdmin
    .from("site_agendamentos_publicos")
    .update({ visualizado_em: new Date().toISOString() })
    .eq("clinica_id", activeClinic.id)
    .is("visualizado_em", null);

  if (error) return;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/notificacoes");
}
