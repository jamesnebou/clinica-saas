"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, LoaderCircle } from "lucide-react";
import {
  isTrustedBrokerMessage,
  META_BROKER_NAVIGATION_POPUP,
  META_BROKER_NAVIGATION_TOP_LEVEL,
  shouldUseTopLevelBroker,
} from "@/lib/whatsapp/broker-core.mjs";

const TERMINAL_STATUSES = new Set(["completed", "failed", "expired"]);

function cleanOnboardingReturnUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("whatsapp_onboarding");
  url.searchParams.delete("whatsapp_session");
  if (!url.searchParams.has("tab")) url.searchParams.set("tab", "conexao");
  return url.toString();
}

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
      setMessage("WhatsApp conectado. Atualizando diagnóstico..."); window.location.replace(cleanOnboardingReturnUrl());
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
    const params = new URLSearchParams(window.location.search);
    const returnedSessionId = params.get("whatsapp_session");
    const returnedOutcome = params.get("whatsapp_onboarding");
    let resumeTimer = null;
    if (returnedSessionId) {
      sessionIdRef.current = returnedSessionId;
      resumeTimer = window.setTimeout(() => {
        setStatus("loading");
        setMessage("Confirmando a conexão com segurança...");
        void checkServerStatus()
          .then((current) => {
            if (current?.ready || TERMINAL_STATUSES.has(current?.status)) return;
            window.history.replaceState({}, "", cleanOnboardingReturnUrl());
            setStatus(returnedOutcome === "cancelled" ? "idle" : "error");
            setMessage(returnedOutcome === "cancelled"
              ? "Conexão cancelada. Você pode tentar novamente."
              : "A conexão ainda não foi confirmada. Tente novamente.");
          })
          .catch((error) => {
            setStatus("error");
            setMessage(error?.message || "Não foi possível confirmar a conexão.");
          });
      }, 0);
    }
    return () => { window.removeEventListener("message", listener); stopPolling(); if (resumeTimer) window.clearTimeout(resumeTimer); };
  }, [checkServerStatus, stopPolling]);

  async function connect() {
    const prefersTopLevel = shouldUseTopLevelBroker({
      viewportWidth: window.innerWidth,
      coarsePointer: window.matchMedia?.("(pointer: coarse)")?.matches,
      maxTouchPoints: window.navigator.maxTouchPoints,
    });
    let navigationMode = prefersTopLevel ? META_BROKER_NAVIGATION_TOP_LEVEL : META_BROKER_NAVIGATION_POPUP;
    let popup = null;
    if (navigationMode === META_BROKER_NAVIGATION_POPUP) {
      popup = window.open("about:blank", "nexawi-whatsapp-connect", "popup=yes,width=560,height=760,resizable=yes,scrollbars=yes");
      if (popup) {
        popupRef.current = popup;
        popup.document.title = "Preparando conexão...";
      } else {
        navigationMode = META_BROKER_NAVIGATION_TOP_LEVEL;
      }
    }
    setStatus("loading"); setMessage("Preparando conexão segura...");
    try {
      const response = await fetch("/api/whatsapp/embedded-signup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ navigationMode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar a conexão.");
      sessionIdRef.current = data.sessionId;
      if (data.mode === "legacy") {
        popup?.close();
        const { runLegacyEmbeddedSignup } = await import("./legacy-embedded-signup");
        const assets = await runLegacyEmbeddedSignup(data);
        const finishResponse = await fetch("/api/whatsapp/embedded-signup/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: data.state, ...assets }),
        });
        const finish = await finishResponse.json().catch(() => ({}));
        if (!finishResponse.ok) throw new Error(finish.error || "Não foi possível concluir a conexão.");
        setStatus("done"); setMessage("WhatsApp conectado. Atualizando diagnóstico..."); window.location.reload();
        return;
      }
      if (data.mode !== "broker") throw new Error("Modo de conexão inválido.");
      if (navigationMode === META_BROKER_NAVIGATION_TOP_LEVEL) {
        window.location.assign(data.brokerUrl);
        return;
      }
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
      popup?.close(); stopPolling(); setStatus("error"); setMessage(error?.message || "Falha ao conectar.");
    }
  }

  return <div><button type="button" onClick={connect} disabled={status === "loading"} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#25D366] px-5 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">{status === "loading" ? <LoaderCircle className="animate-spin" size={18} /> : <Link2 size={18} />} Conectar WhatsApp</button>{message ? <p className={`mt-2 text-sm ${status === "error" ? "text-red-700" : "text-emerald-700"}`}>{message}</p> : null}</div>;
}
