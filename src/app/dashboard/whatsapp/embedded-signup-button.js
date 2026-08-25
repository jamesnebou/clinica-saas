"use client";
import { useEffect, useRef, useState } from "react";
import { Link2, LoaderCircle } from "lucide-react";

export function EmbeddedSignupButton() {
  const [status, setStatus] = useState("idle"); const [message, setMessage] = useState(""); const assets = useRef({});
  useEffect(() => {
    const listener = (event) => {
      if (!["https://www.facebook.com","https://web.facebook.com"].includes(event.origin)) return;
      try { const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; if (data?.type === "WA_EMBEDDED_SIGNUP") assets.current = { wabaId: data?.data?.waba_id, phoneNumberId: data?.data?.phone_number_id }; } catch {}
    };
    window.addEventListener("message", listener); return () => window.removeEventListener("message", listener);
  }, []);

  async function connect() {
    setStatus("loading"); setMessage("");
    try {
      const start = await fetch("/api/whatsapp/embedded-signup/start", { method: "POST" }).then(async (r) => ({ ok: r.ok, data: await r.json() }));
      if (!start.ok) throw new Error(start.data.error);
      if (!window.FB) await new Promise((resolve, reject) => {
        window.fbAsyncInit = () => { window.FB.init({ appId: start.data.appId, autoLogAppEvents: true, xfbml: true, version: start.data.graphVersion }); resolve(); };
        const script = document.createElement("script"); script.src = "https://connect.facebook.net/pt_BR/sdk.js"; script.async = true; script.defer = true; script.onerror = reject; document.body.appendChild(script);
      });
      const response = await new Promise((resolve) => window.FB.login(resolve, { config_id: start.data.configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "", sessionInfoVersion: "3" } }));
      const code = response?.authResponse?.code; const { wabaId, phoneNumberId } = assets.current;
      if (!code || !wabaId || !phoneNumberId) throw new Error("A Meta não retornou todos os ativos. Conclua todas as etapas da janela oficial.");
      const finish = await fetch("/api/whatsapp/embedded-signup/callback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: start.data.state, code, wabaId, phoneNumberId }) }).then(async (r) => ({ ok: r.ok, data: await r.json() }));
      if (!finish.ok) throw new Error(finish.data.error); setStatus("done"); setMessage("WhatsApp conectado. Atualizando diagnóstico..."); window.location.reload();
    } catch (error) { setStatus("error"); setMessage(error?.message || "Falha ao conectar."); }
  }
  return <div><button type="button" onClick={connect} disabled={status === "loading"} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#25D366] px-5 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">{status === "loading" ? <LoaderCircle className="animate-spin" size={18} /> : <Link2 size={18} />} Conectar WhatsApp</button>{message ? <p className={`mt-2 text-sm ${status === "error" ? "text-red-700" : "text-emerald-700"}`}>{message}</p> : null}</div>;
}
