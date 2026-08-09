"use client";

import { useEffect } from "react";

const ATTRIBUTION_KEY = "nexawi_marketing_attribution";
const SESSION_KEY = "nexawi_marketing_session";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

function safeStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function saveStorage(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // Navegadores em modo restrito podem bloquear storage; o funil continua funcionando.
  }
}

export function getMarketingAttribution() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(safeStorage(window.localStorage, ATTRIBUTION_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function getMarketingSessionId() {
  if (typeof window === "undefined") return null;
  let value = safeStorage(window.sessionStorage, SESSION_KEY);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    saveStorage(window.sessionStorage, SESSION_KEY, value);
  }
  return value;
}

export function trackMarketingEvent(eventName, metadata = {}, options = {}) {
  if (typeof window === "undefined") return;
  const attribution = getMarketingAttribution();
  const body = JSON.stringify({
    event_name: eventName,
    session_id: getMarketingSessionId(),
    page: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || null,
    ...attribution,
    metadata,
  });

  if (!options.skipInternal) {
    fetch("/api/public/marketing-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => null);
  }

  window.gtag?.("event", eventName, metadata);
  window.fbq?.("trackCustom", eventName, metadata);
}

export function ConversionTracker() {
  useEffect(() => {
    if (window.location.hash) return undefined;

    const previousScrollRestoration = window.history.scrollRestoration;
    const resetToTop = () => {
      if (!window.location.hash) {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    };

    window.history.scrollRestoration = "manual";
    resetToTop();
    const frame = window.requestAnimationFrame(resetToTop);
    window.addEventListener("pageshow", resetToTop);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", resetToTop);
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const previous = getMarketingAttribution();
    const attribution = { ...previous };
    let hasNewAttribution = false;

    for (const key of UTM_KEYS) {
      const value = params.get(key)?.trim();
      if (value) {
        attribution[key] = value.slice(0, 120);
        hasNewAttribution = true;
      }
    }

    if (hasNewAttribution || !safeStorage(window.localStorage, ATTRIBUTION_KEY)) {
      attribution.first_page ||= window.location.pathname;
      attribution.first_referrer ||= document.referrer || null;
      saveStorage(window.localStorage, ATTRIBUTION_KEY, JSON.stringify(attribution));
    }

    const viewKey = `nexawi_landing_view_${getMarketingSessionId()}`;
    if (!safeStorage(window.sessionStorage, viewKey)) {
      saveStorage(window.sessionStorage, viewKey, "1");
      trackMarketingEvent("landing_view");
    }
  }, []);

  return null;
}
