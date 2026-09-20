"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, LoaderCircle } from "lucide-react";
import { createSignupAttempt, embeddedSignupOptions } from "@/lib/whatsapp/embedded-signup-core.mjs";

export function EmbeddedSignupButton() {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("cloud_only");
  const attempt = useRef(null);
  const busy = useRef(false);

  useEffect(() => {
    const listener = (event) => attempt.current?.event(event.origin, event.data);
    window.addEventListener("message", listener);
    return () => {
      window.removeEventListener("message", listener);
      attempt.current?.cancel("Conexao interrompida.");
    };
  }, []);

  async function connect() {
    if (busy.current) return;
    busy.current = true;
    setStatus("loading");
    setMessage("");
    let timeout;
    try {
      const start = await fetch("/api/whatsapp/embedded-signup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingMode: mode }),
      }).then(async (response) => ({ ok: response.ok, data: await response.json() }));
      if (!start.ok) throw new Error(start.data.error);

      if (!window.FB) {
        await new Promise((resolve, reject) => {
          window.fbAsyncInit = resolve;
          const script = document.createElement("script");
          script.src = "https://connect.facebook.net/pt_BR/sdk.js";
          script.async = true;
          script.defer = true;
          script.onerror = () => reject(new Error("Nao foi possivel carregar a Meta."));
          document.body.appendChild(script);
        });
      }
      window.FB.init({
        appId: start.data.appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: start.data.graphVersion,
      });

      const outcome = await new Promise((resolve, reject) => {
        const currentAttempt = createSignupAttempt(start.data.onboardingMode, {
          complete: resolve,
          fail: (text) => reject(new Error(text)),
        });
        attempt.current = currentAttempt;
        // Bound waiting to the server session lifetime, including missing FINISH/code.
        timeout = setTimeout(() => attempt.current?.cancel("Sessao expirada. Inicie novamente."), Math.max(0, Date.parse(start.data.expiresAt) - Date.now()));
        try {
          window.FB.login(
            (response) => currentAttempt.response(response),
            embeddedSignupOptions(start.data.configId, start.data.onboardingMode),
          );
        } catch {
          attempt.current.cancel("Nao foi possivel iniciar a autorizacao da Meta.");
        }
      });
      clearTimeout(timeout);
      const finish = await fetch("/api/whatsapp/embedded-signup/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: start.data.state, ...outcome }),
      }).then(async (response) => ({ ok: response.ok, data: await response.json() }));
      if (!finish.ok) throw new Error(finish.data.error);
      setStatus("done");
      setMessage("WhatsApp conectado. Atualizando diagnóstico...");
      window.location.reload();
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "Falha ao conectar.");
    } finally {
      clearTimeout(timeout);
      attempt.current?.dispose();
      attempt.current = null;
      busy.current = false;
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <label className="text-sm font-semibold">
        Tipo de conexão
        <select aria-label="Tipo de conexão WhatsApp" value={mode} disabled={status === "loading"} onChange={(event) => setMode(event.target.value)} className="mt-1 block min-h-11 w-full max-w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900">
          <option value="cloud_only">Cloud API: número exclusivo</option>
          <option value="coexistence">Coexistence: manter WhatsApp Business App</option>
        </select>
      </label>
      <button type="button" onClick={connect} disabled={status === "loading"} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#25D366] px-5 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">
        {status === "loading" ? <LoaderCircle className="animate-spin" size={18} /> : <Link2 size={18} />}
        Conectar WhatsApp
      </button>
      {message ? <p role="status" className={`mt-2 text-sm ${status === "error" ? "text-red-700" : "text-emerald-700"}`}>{message}</p> : null}
    </div>
  );
}
