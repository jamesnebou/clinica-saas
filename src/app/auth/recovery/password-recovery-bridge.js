"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function PasswordRecoveryBridge({ next, errorPath }) {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function completeRecovery() {
      try {
        const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const isRecoveryLink = fragment.get("type") === "recovery" && fragment.has("access_token") && fragment.has("refresh_token");

        if (!isRecoveryLink) {
          router.replace(errorPath);
          return;
        }

        const supabase = createClient();
        const { data, error } = await supabase.auth.getSession();

        if (!active) return;
        if (error || !data?.session) {
          router.replace(errorPath);
          return;
        }

        router.replace(next);
        router.refresh();
      } catch {
        if (!active) return;
        router.replace(errorPath);
      }
    }

    completeRecovery();
    return () => {
      active = false;
    };
  }, [errorPath, next, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7f4] px-5 py-10 text-neutral-950">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-sm sm:p-7">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-orange-50 text-[#ed7009]">
          <KeyRound size={21} />
        </div>
        <h1 className="mt-5 text-xl font-black">Validando link seguro</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">Aguarde enquanto preparamos a troca da sua senha.</p>
      </div>
    </main>
  );
}
