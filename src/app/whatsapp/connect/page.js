import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BrokerClient } from "./broker-client";
import { getEmbeddedSignupBrokerSession } from "@/lib/whatsapp/onboarding";
import { getRequestOrigin, isMetaConnectRequestOrigin } from "@/lib/whatsapp/broker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conectar WhatsApp | NexaWi", referrer: "no-referrer" };

function BrokerError({ children }) {
  return <main className="grid min-h-screen place-items-center bg-neutral-100 p-5"><section className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"><p className="text-xs font-black uppercase text-orange-600">NexaWi Clínicas</p><h1 className="mt-3 text-2xl font-black text-neutral-950">Conectar WhatsApp</h1><p className="mt-3 text-sm leading-6 text-neutral-700">{children}</p></section></main>;
}

export default async function MetaConnectPage({ searchParams }) {
  const headerStore = await headers();
  const request = { headers: headerStore, url: "https://invalid.local" };
  if (!isMetaConnectRequestOrigin(getRequestOrigin(request))) notFound();
  const { state = "" } = await searchParams;
  let session = null;
  try {
    session = await getEmbeddedSignupBrokerSession({ state });
  } catch {}
  if (!session) return <BrokerError>Esta sessão é inválida, expirou ou já foi utilizada. Feche esta janela e tente novamente pelo dashboard.</BrokerError>;
  if (!session.appId || !session.configId || !session.graphVersion) return <BrokerError>Integração Meta indisponível neste ambiente.</BrokerError>;
  if (session.status === "processing") return <BrokerError>A conexão está sendo validada. Aguarde a atualização no dashboard.</BrokerError>;
  return <BrokerClient state={state} {...session} />;
}
