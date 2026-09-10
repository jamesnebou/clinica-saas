"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, LoaderCircle } from "lucide-react";
import { isTrustedBrokerMessage } from "@/lib/whatsapp/broker-core.mjs";

const TERMINAL_STATUSES = new Set(["completed", "failed", "expired"]);

export function EmbeddedSignupButton() {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const popupRef = useRef(null);
  const sessionIdRef = useRef("");
  const expectedOriginRef = useRef("");
  const pollTimerRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
  }, []);

  const checkServerStatus = useCallback(async () => {
    if (!sessionIdRef.current) return null;
    const response = await fetch(`/api/whatsapp/embedded-signup/status?sessionId=${encodeURIComponent(sessionIdRef.current)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível verificar a conexão.");
    if (data.ready) {
      stopPolling(); popupRef.current?.close(); setStatus("done");
      setMessage("WhatsApp conectado. Atualizando diagnóstico..."); window.location.reload();
    } else if (TERMINAL_STATUSES.has(data.status)) {
      stopPolling(); setStatus("error");
      setMessage(data.status === "expired" ? "A sessão expirou. Inicie novamente." : "A conexão não foi concluída. Tente novamente.");
    }
    return data;
  }, [stopPolling]);

  useEffect(() => {
    const listener = (event) => {
      if (!isTrustedBrokerMessage({ eventOrigin: event.origin, expectedOrigin: expectedOriginRef.current, eventSource: event.source, popupWindow: popupRef.current, data: event.data, sessionId: sessionIdRef.current })) return;
      void checkServerStatus().catch(() => {});
    };
    window.addEventListener("message", listener);
    return () => { window.removeEventListener("message", listener); stopPolling(); };
  }, [checkServerStatus, stopPolling]);

  async function connect() {
    const popup = window.open("about:blank", "nexawi-whatsapp-connect", "popup=yes,width=560,height=760,resizable=yes,scrollbars=yes");
    if (!popup) { setStatus("error"); setMessage("Permita popups neste site para conectar o WhatsApp."); return; }
    popupRef.current = popup;
    popup.document.title = "Preparando conexão...";
    setStatus("loading"); setMessage("Preparando conexão segura...");
    try {
      const response = await fetch("/api/whatsapp/embedded-signup/start", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar a conexão.");
      sessionIdRef.current = data.sessionId;
      expectedOriginRef.current = data.connectOrigin;
      popup.location.replace(data.brokerUrl);
      setMessage("Conclua a autorização na janela aberta.");
      stopPolling();
      pollTimerRef.current = window.setInterval(() => {
        void checkServerStatus().catch(() => {});
        if (popup.closed) {
          void checkServerStatus().then((current) => {
            if (current?.status === "processing") {
              setMessage("A Meta concluiu a etapa interativa. Validando a conexão no servidor...");
            } else if (!current?.ready && !TERMINAL_STATUSES.has(current?.status)) {
              stopPolling(); setStatus("error"); setMessage("A janela foi fechada antes da conclusão.");
            }
          }).catch(() => {});
        }
      }, 2000);
    } catch (error) {
      popup.close(); stopPolling(); setStatus("error"); setMessage(error?.message || "Falha ao conectar.");
    }
  }

  return <div><button type="button" onClick={connect} disabled={status === "loading"} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#25D366] px-5 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">{status === "loading" ? <LoaderCircle className="animate-spin" size={18} /> : <Link2 size={18} />} Conectar WhatsApp</button>{message ? <p className={`mt-2 text-sm ${status === "error" ? "text-red-700" : "text-emerald-700"}`}>{message}</p> : null}</div>;
}
