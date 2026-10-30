import Link from "next/link";
import { verifyStaffInvitationAction } from "../actions";

export const metadata = { title: "Aceitar convite | NexaWi Clínicas" };

export default async function VerifyInvitationPage({ searchParams }) {
  const params = await searchParams;
  const valid = /^[0-9a-f-]{36}$/i.test(String(params?.id || "")) &&
    ["invite", "magiclink"].includes(String(params?.type || "")) &&
    Boolean(params?.token_hash && String(params.token_hash).length <= 512);
  return <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-5 py-10 text-neutral-950">
    <section className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <Link href="/" className="text-sm font-bold text-[#ed7009]">NexaWi Clínicas</Link>
      <h1 className="mt-5 text-2xl font-bold">Convite para a equipe</h1>
      {valid ? <form action={verifyStaffInvitationAction} className="mt-5 space-y-4">
        <p className="text-sm text-neutral-600">Confirme seu acesso à clínica. O link pode ser usado uma única vez.</p>
        <input type="hidden" name="id" value={params.id} />
        <input type="hidden" name="type" value={params.type} />
        <input type="hidden" name="token_hash" value={params.token_hash} />
        <button className="h-11 w-full rounded-lg bg-neutral-950 text-sm font-semibold text-white" type="submit">Aceitar convite</button>
      </form> : <p className="mt-5 text-sm text-neutral-600">Link inválido. Solicite um novo convite ao gestor.</p>}
    </section>
  </main>;
}
