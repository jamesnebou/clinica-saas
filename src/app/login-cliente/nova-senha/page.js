import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getCurrentUser, isInternalAdminUser } from "@/lib/auth/session";
import { isDemoLoginEmail } from "@/lib/demo/demo-account";
import { ClientPasswordUpdateForm } from "../password-reset-form";

export const metadata = { title: "Nova senha | NexaWi Clínicas" };

export default async function ClientNewPasswordPage() {
  const user = await getCurrentUser();
  if (!user || isInternalAdminUser(user) || isDemoLoginEmail(user.email)) redirect("/login-cliente/recuperar-senha");
  return <main className="flex min-h-screen items-center justify-center bg-[#f7f7f4] px-5 py-10 text-neutral-950"><div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-7"><Link href="/" className="text-xs font-black uppercase tracking-[0.22em] text-[#ed7009]">NexaWi Clínicas</Link><div className="mt-6 flex h-11 w-11 items-center justify-center rounded-lg bg-orange-50 text-[#ed7009]"><KeyRound size={21} /></div><p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-[#ed7009]">Área da clínica</p><h1 className="mt-2 text-2xl font-black">Definir nova senha</h1><p className="mt-3 text-sm leading-6 text-neutral-600">Use pelo menos oito caracteres e não reutilize senhas antigas.</p><ClientPasswordUpdateForm /></div></main>;
}
