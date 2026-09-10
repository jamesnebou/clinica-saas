"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircle, X } from "lucide-react";
import { META_BROKER_MESSAGE_TYPE } from "@/lib/whatsapp/broker-core.mjs";

const META_MESSAGE_ORIGINS = new Set(["https://www.facebook.com", "https://web.facebook.com"]);

function parseMetaMessage(event) {
  if (!META_MESSAGE_ORIGINS.has(event.origin)) return null;
  try { return typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return null; }
}

export function BrokerClient({ state, sessionId, status: initialStatus, returnOrigin, appId, configId, graphVersion }) {
  const [status, setStatus] = useState(initialStatus === "completed" ? "done" : "loading");
  const [message, setMessage] = useState(initialStatus === "completed" ? "WhatsApp já conectado." : "Preparando conexão segura...");
  const [sdkReady, setSdkReady] = useState(false);
  const [launching, setLaunching] = useState(false);
  const assets = useRef({});
  const terminal = useRef(initialStatus === "completed");
  const launchingRef = useRef(false);
  const attemptRef = useRef(0);

  const notifyOpener = useCallback((result) => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: META_BROKER_MESSAGE_TYPE, sessionId, result }, returnOrigin);
    }
  }, [returnOrigin, sessionId]);

  const sendOutcome = useCallback(async (payload) => {
    const response = await fetch("/api/whatsapp/embedded-signup/broker/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível concluir a conexão.");
    return data;
  }, [state]);

  const resetForRetry = useCallback((nextMessage) => {
    launchingRef.current = false;
    setLaunching(false);
    setStatus("ready");
    setMessage(nextMessage);
  }, []);

  useEffect(() => {
    if (initialStatus === "completed") {
      notifyOpener("completed");
      const timer = window.setTimeout(() => window.close(), 700);
      return () => window.clearTimeout(timer);
    }

    const metaListener = (event) => {
      const data = parseMetaMessage(event);
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH") {
        assets.current = { wabaId: data?.data?.waba_id, phoneNumberId: data?.data?.phone_number_id };
      } else if (data.event === "CANCEL" && !terminal.current) {
        attemptRef.current += 1;
        resetForRetry("Conexão cancelada. Toque para tentar novamente.");
      } else if (data.event === "ERROR" && !terminal.current) {
        terminal.current = true;
        attemptRef.current += 1;
        launchingRef.current = false;
        setLaunching(false);
        void sendOutcome({ outcome: "meta_refused" }).catch(() => {}).finally(() => {
          setStatus("error");
          setMessage("A Meta não autorizou a conexão.");
          notifyOpener("meta_refused");
        });
      }
    };
    window.addEventListener("message", metaListener);

    const initializeSdk = () => {
      if (terminal.current) return;
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: graphVersion });
      setSdkReady(true);
      setStatus("ready");
      setMessage("Tudo pronto para continuar.");
    };

    let script = null;
    if (window.FB) {
      initializeSdk();
    } else {
      window.fbAsyncInit = initializeSdk;
      script = document.createElement("script");
      script.src = "https://connect.facebook.net/pt_BR/sdk.js";
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        if (terminal.current) return;
        terminal.current = true;
        void sendOutcome({ outcome: "broker_failed" }).catch(() => {}).finally(() => {
          setStatus("error");
          setMessage("Não foi possível carregar a conexão da Meta.");
          notifyOpener("failed");
        });
      };
      document.body.appendChild(script);
    }
    return () => {
      window.removeEventListener("message", metaListener);
      script?.remove();
      delete window.fbAsyncInit;
    };
  }, [appId, graphVersion, initialStatus, notifyOpener, resetForRetry, sendOutcome]);

  function launchMetaSignup() {
    if (!sdkReady || !window.FB || launchingRef.current || terminal.current) return;
    const attempt = ++attemptRef.current;
    launchingRef.current = true;
    assets.current = {};
    setLaunching(true);
    setStatus("opening");
    setMessage("Abrindo janela oficial da Meta...");
    window.FB.login(async (response) => {
      if (attempt !== attemptRef.current || terminal.current) return;
      const code = response?.authResponse?.code;
      const { wabaId, phoneNumberId } = assets.current;
      if (!code) {
        attemptRef.current += 1;
        resetForRetry("Conexão cancelada. Toque para tentar novamente.");
        return;
      }
      if (!wabaId || !phoneNumberId) {
        terminal.current = true;
        launchingRef.current = false;
        setLaunching(false);
        await sendOutcome({ outcome: "assets_missing" }).catch(() => {});
        setStatus("error"); setMessage("A Meta não retornou a conta e o número selecionados."); notifyOpener("assets_missing");
        return;
      }
      terminal.current = true;
      launchingRef.current = false;
      setLaunching(false);
      setStatus("processing"); setMessage("Validando sua conexão com segurança...");
      try {
        await sendOutcome({ code, wabaId, phoneNumberId });
        setStatus("done"); setMessage("WhatsApp conectado com sucesso."); notifyOpener("completed");
        window.setTimeout(() => window.close(), 700);
      } catch (error) {
        setStatus("error"); setMessage(error?.message || "Não foi possível concluir a conexão."); notifyOpener("failed");
      }
    }, { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "", sessionInfoVersion: "3" } });
  }

  const actionDisabled = !sdkReady || launching || ["processing", "done", "error"].includes(status);
  return <main className="grid min-h-screen place-items-center bg-neutral-100 p-5"><section className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase text-orange-600">NexaWi Clínicas</p><h1 className="mt-3 text-2xl font-black text-neutral-950">Conectar WhatsApp</h1></div><button type="button" onClick={() => window.close()} aria-label="Fechar" className="grid size-10 place-items-center rounded-lg border border-neutral-200 text-neutral-700"><X size={18}/></button></div><div className="mt-6 flex items-center gap-3 rounded-lg bg-neutral-50 p-4 text-neutral-800">{["loading", "opening", "processing"].includes(status) ? <LoaderCircle className="animate-spin text-emerald-700" size={22}/> : <MessageCircle className={status === "error" ? "text-red-600" : "text-emerald-700"} size={22}/>}<p className="text-sm font-semibold">{message}</p></div><button type="button" onClick={launchMetaSignup} disabled={actionDisabled} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#1877F2] px-5 text-sm font-black text-white transition hover:bg-[#166fe5] disabled:cursor-not-allowed disabled:opacity-50">{launching ? "Abrindo Meta..." : "Continuar com a Meta"}</button></section></main>;
}
