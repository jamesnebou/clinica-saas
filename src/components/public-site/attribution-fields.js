"use client";

import { useEffect, useRef } from "react";

const EMPTY = { source: "", medium: "", campaign: "", content: "", term: "", referrer: "", landing_page: "" };

function readAttribution() {
  if (typeof window === "undefined") return EMPTY;
  const query = new URLSearchParams(window.location.search);
  const current = {
    source: query.get("utm_source") || "",
    medium: query.get("utm_medium") || "",
    campaign: query.get("utm_campaign") || "",
    content: query.get("utm_content") || "",
    term: query.get("utm_term") || "",
    referrer: document.referrer || "",
    landing_page: `${window.location.pathname}${window.location.search}`,
  };
  try {
    const saved = JSON.parse(window.localStorage.getItem("nexawi_clinic_attribution") || "null");
    const hasCampaign = current.source || current.medium || current.campaign;
    const effective = hasCampaign ? current : { ...EMPTY, ...(saved || {}), referrer: current.referrer || saved?.referrer || "", landing_page: saved?.landing_page || current.landing_page };
    if (hasCampaign || !saved) window.localStorage.setItem("nexawi_clinic_attribution", JSON.stringify(effective));
    return effective;
  } catch {
    return current;
  }
}

export function AttributionFields() {
  const containerRef = useRef(null);
  useEffect(() => {
    const attribution = readAttribution();
    for (const [name, value] of Object.entries(attribution)) {
      const input = containerRef.current?.querySelector(`[name="${name}"]`);
      if (input) input.value = value;
    }
  }, []);
  return <span ref={containerRef} hidden>{Object.keys(EMPTY).map((name) => <input key={name} type="hidden" name={name} defaultValue="" />)}</span>;
}

export function PublicAnalyticsTracker({ slug }) {
  useEffect(() => {
    const attribution = readAttribution();
    let sessionId;
    try {
      sessionId = window.sessionStorage.getItem("nexawi_clinic_session") || crypto.randomUUID();
      window.sessionStorage.setItem("nexawi_clinic_session", sessionId);
    } catch {
      sessionId = crypto.randomUUID();
    }

    function send(eventName, metadata = {}) {
      const body = JSON.stringify({ slug, eventName, sessionId, attribution, metadata });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/public/analytics", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/public/analytics", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    }

    send("page_view", { path: window.location.pathname });
    function trackClick(event) {
      const target = event.target.closest?.("a,button");
      if (!target) return;
      const href = target.getAttribute("href") || "";
      const explicit = target.dataset.analyticsEvent;
      if (!explicit && !href.includes("#agendar") && !href.includes("wa.me") && !href.includes("whatsapp")) return;
      send(explicit || "cta_click", { label: target.textContent?.trim().slice(0, 100) || "", target: href.slice(0, 300) });
    }
    document.addEventListener("click", trackClick, { passive: true });
    return () => document.removeEventListener("click", trackClick);
  }, [slug]);
  return null;
}
