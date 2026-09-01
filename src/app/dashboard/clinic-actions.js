"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserClinics } from "@/lib/auth/session";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function switchActiveClinicAction(formData) {
  const clinicId = String(formData.get("clinic_id") || "").trim();
  if (!UUID_PATTERN.test(clinicId)) redirect("/dashboard?erro=clinica_invalida");

  const context = await getUserClinics();
  if (!context.user) redirect("/login-cliente");
  if (!context.memberships.some((item) => item.clinica_id === clinicId)) {
    redirect("/dashboard?erro=clinica_invalida");
  }

  const cookieStore = await cookies();
  cookieStore.set("nexawi_active_clinic", clinicId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}
