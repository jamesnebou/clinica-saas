import { safeInternalNext } from "@/lib/auth/self-service.mjs";
import { PasswordRecoveryBridge } from "./password-recovery-bridge";

export const metadata = { title: "Validando recuperação | NexaWi Clínicas" };

export default async function PasswordRecoveryPage({ searchParams }) {
  const params = await searchParams;
  const next = safeInternalNext(params?.next, "/login-cliente/nova-senha");
  const isAdmin = next.startsWith("/login/");

  return (
    <PasswordRecoveryBridge
      next={next}
      errorPath={isAdmin ? "/login/recuperar-senha?erro=link" : "/login-cliente/recuperar-senha?erro=link"}
    />
  );
}
