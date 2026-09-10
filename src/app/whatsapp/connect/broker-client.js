"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, MessageCircle, X } from "lucide-react";
import { META_BROKER_MESSAGE_TYPE, META_BROKER_NAVIGATION_TOP_LEVEL } from "@/lib/whatsapp/broker-core.mjs";
import {
  buildEmbeddedSignupV4LoginOptions,
  isTrustedMetaMessageOrigin,
  metaMessageOriginHostname,
  sanitizeBrokerTelemetryError,
} from "@/lib/whatsapp/broker-client-core.mjs";

const META_LOGIN_UI_TIMEOUT_MS = 30_000;

function parseMetaMessage(event) {
  if (!isTrustedMetaMessageOrigin(event.origin)) return null;
  try {
    const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    return data && typeof data === "object"
      ? { data, hostname: metaMessageOriginHostname(event.origin) }
      : null;
  } catch {
    return null;
  }
}

export function BrokerClient({ state, sessionId, status: initialStatus, returnOrigin, navigationMode, cancelReturnUrl, completedReturnUrl, appId, configId, graphVersion }) {
  const [status, setStatus] = useState(initialStatus === "completed" ? "done" : "loading");
  const [message, setMessage] = useState(initialStatus === "completed" ? "WhatsApp já conectado." : "Preparando conexão segura...");
  const [sdkReady, setSdkReady] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [showReturnAction, setShowReturnAction] = useState(false);
  const assets = useRef({});
  const terminal = useRef(initialStatus === "completed");
  const launchingRef = useRef(false);
  const attemptRef = useRef(0);
  const loginTimeoutRef = useRef(null);
  const topLevelNavigation = navigationMode === META_BROKER_NAVIGATION_TOP_LEVEL;

  const recordTelemetry = useCallback((event, details = {}) => {
    void fetch("/api/whatsapp/embedded-signup/broker/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, event, ...details }),
      keepalive: true,
    }).catch(() => {});
  }, [state]);

  const notifyOpener = useCallback((result) => {
    if (!window.opener || window.opener.closed) return false;
    window.opener.postMessage({ type: META_BROKER_MESSAGE_TYPE, sessionId, result }, returnOrigin);
    return true;
  }, [returnOrigin, sessionId]);

  const clearLoginTimeout = useCallback(() => {
    if (loginTimeoutRef.current) window.clearTimeout(loginTimeoutRef.current);
    loginTimeoutRef.current = null;
  }, []);

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

  const resetForRetry = useCallback((nextMessage, allowReturn = false) => {
    launchingRef.current = false;
    setLaunching(false);
    setStatus("ready");
    setMessage(nextMessage);
    setShowReturnAction(allowReturn);
  }, []);

  const finishBrowserFlow = useCallback((result, safeReturnUrl) => {
    if (!topLevelNavigation && notifyOpener(result)) {
      window.setTimeout(() => window.close(), 700);
      return;
    }
    window.location.assign(safeReturnUrl);
  }, [notifyOpener, topLevelNavigation]);

  const returnToClinic = useCallback(() => {
    window.location.assign(cancelReturnUrl);
  }, [cancelReturnUrl]);

  useEffect(() => {
    recordTelemetry("broker_rendered");
    if (initialStatus === "completed") {
      finishBrowserFlow("completed", completedReturnUrl);
      return;
    }

    const metaListener = (event) => {
      const parsed = parseMetaMessage(event);
      const data = parsed?.data;
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (!["FINISH", "CANCEL", "ERROR"].includes(data.event)) return;
      recordTelemetry("meta_message_received", {
        meta_hostname: parsed.hostname,
        meta_type: data.type,
        meta_event: data.event,
      });
      if (data.event === "FINISH") {
        recordTelemetry("meta_finish");
        clearLoginTimeout();
        assets.current = { wabaId: data?.data?.waba_id, phoneNumberId: data?.data?.phone_number_id };
        setStatus("processing");
        setMessage("Validando sua conexão com segurança...");
      } else if (data.event === "CANCEL" && !terminal.current) {
        recordTelemetry("meta_cancel");
        clearLoginTimeout();
        attemptRef.current += 1;
        resetForRetry("Conexão cancelada. Toque para tentar novamente.", true);
      } else if (data.event === "ERROR" && !terminal.current) {
        recordTelemetry("meta_error");
        clearLoginTimeout();
        terminal.current = true;
        attemptRef.current += 1;
        launchingRef.current = false;
        setLaunching(false);
        void sendOutcome({ outcome: "meta_refused" }).catch(() => {}).finally(() => {
          setStatus("error");
          setMessage("A Meta não autorizou a conexão.");
          setShowReturnAction(true);
          notifyOpener("meta_refused");
        });
      }
    };
    window.addEventListener("message", metaListener);

    const visibilityListener = () => {
      recordTelemetry(document.visibilityState === "hidden"
        ? "document_visibility_hidden"
        : "document_visibility_visible");
    };
    const pageHideListener = () => recordTelemetry("pagehide");
    const pageShowListener = () => recordTelemetry("pageshow");
    document.addEventListener("visibilitychange", visibilityListener);
    window.addEventListener("pagehide", pageHideListener);
    window.addEventListener("pageshow", pageShowListener);

    const initializeSdk = () => {
      if (terminal.current) return;
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: graphVersion });
      recordTelemetry("fb_init_completed");
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
      script.crossOrigin = "anonymous";
      script.onload = () => recordTelemetry("sdk_script_loaded");
      script.onerror = () => {
        if (terminal.current) return;
        terminal.current = true;
        void sendOutcome({ outcome: "broker_failed" }).catch(() => {}).finally(() => {
          setStatus("error");
          setMessage("Não foi possível carregar a conexão da Meta.");
          setShowReturnAction(true);
          notifyOpener("failed");
        });
      };
      recordTelemetry("sdk_script_loading");
      document.body.appendChild(script);
    }
    return () => {
      window.removeEventListener("message", metaListener);
      document.removeEventListener("visibilitychange", visibilityListener);
      window.removeEventListener("pagehide", pageHideListener);
      window.removeEventListener("pageshow", pageShowListener);
      clearLoginTimeout();
      script?.remove();
      delete window.fbAsyncInit;
    };
  }, [appId, clearLoginTimeout, completedReturnUrl, finishBrowserFlow, graphVersion, initialStatus, notifyOpener, recordTelemetry, resetForRetry, sendOutcome]);

  function launchMetaSignup() {
    if (!sdkReady || !window.FB || launchingRef.current || terminal.current) return;
    const userActivationBefore = window.navigator.userActivation?.isActive ?? null;
    const attempt = ++attemptRef.current;
    launchingRef.current = true;
    assets.current = {};
    try {
      window.FB.login(async (response) => {
        if (attempt !== attemptRef.current || terminal.current) return;
        recordTelemetry("fb_login_callback_received");
        clearLoginTimeout();
        const code = response?.authResponse?.code;
        const { wabaId, phoneNumberId } = assets.current;
        if (!code) {
          recordTelemetry("fb_login_callback_without_code");
          attemptRef.current += 1;
          resetForRetry("Conexão cancelada. Toque para tentar novamente.", true);
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
          const outcome = await sendOutcome({ code, wabaId, phoneNumberId });
          setStatus("done"); setMessage("WhatsApp conectado com sucesso.");
          finishBrowserFlow("completed", outcome.returnUrl || completedReturnUrl);
        } catch (error) {
          setStatus("error"); setMessage(error?.message || "Não foi possível concluir a conexão."); setShowReturnAction(true); notifyOpener("failed");
        }
      }, buildEmbeddedSignupV4LoginOptions(configId));
    } catch (error) {
      recordTelemetry("continue_meta_clicked");
      recordTelemetry("fb_login_invoked");
      recordTelemetry("fb_login_threw", {
        user_activation_before: userActivationBefore,
        ...sanitizeBrokerTelemetryError(error),
      });
      clearLoginTimeout();
      attemptRef.current += 1;
      resetForRetry("Não foi possível iniciar a autorização da Meta.", true);
      return;
    }

    recordTelemetry("continue_meta_clicked");
    recordTelemetry("fb_login_invoked");
    recordTelemetry("fb_login_returned_sync", {
      user_activation_before: userActivationBefore,
    });
    if (attempt !== attemptRef.current || terminal.current) return;
    setLaunching(true);
    setShowReturnAction(false);
    setStatus("opening");
    setMessage("Abrindo janela oficial da Meta...");
    loginTimeoutRef.current = window.setTimeout(() => {
      if (attempt !== attemptRef.current || terminal.current) return;
      recordTelemetry("fb_login_timeout");
      resetForRetry("Não foi possível abrir a Meta. Tente novamente.", true);
    }, META_LOGIN_UI_TIMEOUT_MS);
  }

  const actionDisabled = !sdkReady || launching || ["processing", "done", "error"].includes(status);
  return <main className="grid min-h-screen place-items-center bg-neutral-100 p-5"><section className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase text-orange-600">NexaWi Clínicas</p><h1 className="mt-3 text-2xl font-black text-neutral-950">Conectar WhatsApp</h1></div><button type="button" onClick={topLevelNavigation ? returnToClinic : () => window.close()} aria-label={topLevelNavigation ? "Voltar para a clínica" : "Fechar"} className="grid size-10 place-items-center rounded-lg border border-neutral-200 text-neutral-700">{topLevelNavigation ? <ArrowLeft size={18}/> : <X size={18}/>}</button></div><div className="mt-6 flex items-center gap-3 rounded-lg bg-neutral-50 p-4 text-neutral-800">{["loading", "opening", "processing"].includes(status) ? <LoaderCircle className="animate-spin text-emerald-700" size={22}/> : <MessageCircle className={status === "error" ? "text-red-600" : "text-emerald-700"} size={22}/>}<p className="text-sm font-semibold">{message}</p></div><button type="button" onClick={launchMetaSignup} disabled={actionDisabled} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#1877F2] px-5 text-sm font-black text-white transition hover:bg-[#166fe5] disabled:cursor-not-allowed disabled:opacity-50">{launching ? "Abrindo Meta..." : "Continuar com a Meta"}</button>{showReturnAction ? <button type="button" onClick={returnToClinic} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-5 text-sm font-black text-neutral-800"><ArrowLeft size={17}/> Voltar para a clínica</button> : null}</section></main>;
}
