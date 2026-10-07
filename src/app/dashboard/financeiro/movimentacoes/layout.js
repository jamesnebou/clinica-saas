import { requireClinicCapability } from "@/lib/auth/session";

export default async function MovimentacoesLayout({ children }) {
  await requireClinicCapability("financeiro", "financeiro_avancado", { redirectOnDenied: true });
  return children;
}
