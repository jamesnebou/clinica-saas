"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

export default function CrmError({ reset }) {
  return (
    <main className="mx-auto flex min-h-[65vh] w-full max-w-3xl items-center justify-center px-4 py-12">
      <section className="premium-panel w-full rounded-lg p-6 text-center sm:p-10">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-700">
          <AlertTriangle size={24} />
        </span>
        <h1 className="mt-5 text-2xl font-black text-neutral-950">Não foi possível carregar o CRM</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-600">
          Seus dados permanecem salvos. Tente carregar esta área novamente; se a conexão estiver instável, aguarde alguns segundos.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-5 text-sm font-bold text-white">
            <RefreshCw size={16} /> Tentar novamente
          </button>
          <Link href="/dashboard" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-5 text-sm font-bold text-neutral-800">
            <ArrowLeft size={16} /> Voltar à visão geral
          </Link>
        </div>
      </section>
    </main>
  );
}
