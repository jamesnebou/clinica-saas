"use client";

import { useEffect } from "react";
import {
  captureMarketingAttribution,
  createMarketingEventId,
  fireMetaBrowserEvent,
  getMarketingAttribution,
  getMarketingSessionId,
  refreshMetaCookieAttribution,
} from "@/lib/tracking/client-attribution";

export { getMarketingAttribution, getMarketingSessionId };

function currentPage() {
  return `${window.location.pathname}${window.location.search}`;
}

export function trackMarketingEvent(eventName, metadata = {}, options = {}) {
  if (typeof window === "undefined") return null;
  const attribution = getMarketingAttribution();
  const eventId = options.eventId || null;
  const body = JSON.stringify({
    event_name: eventName,
    session_id: getMarketingSessionId(),
    page: currentPage(),
    referrer: document.referrer || null,
    ...attribution,
    metadata,
    meta_event_id: eventId,
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
  return eventId;
}

export function trackMetaStandardEvent(eventName, parameters = {}, eventId) {
  return fireMetaBrowserEvent(eventName, parameters, eventId);
}

export function ConversionTracker({ segment = "geral", pageType = "marketing", contentName = "NexaWi Clínicas" } = {}) {
  useEffect(() => {
    if (window.location.hash) return undefined;

    const previousScrollRestoration = window.history.scrollRestoration;
    const resetToTop = () => {
      if (!window.location.hash) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
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
    const context = { segment, pageType };
    captureMarketingAttribution(context);
    trackMetaStandardEvent("PageView", { segment, page_type: pageType });

    // O Pixel cria _fbp de forma assíncrona. Fazemos uma atualização leve sem alterar first-touch.
    const refreshTimers = [250, 1000].map((delay) => window.setTimeout(() => refreshMetaCookieAttribution(context), delay));

    const sessionId = getMarketingSessionId();
    const viewKey = `nexawi_landing_view_${sessionId}_${window.location.pathname}`;
    let tracked = false;
    try {
      tracked = window.sessionStorage.getItem(viewKey) === "1";
    } catch {}

    if (!tracked) {
      try { window.sessionStorage.setItem(viewKey, "1"); } catch {}
      const eventId = createMarketingEventId("view_content");
      const parameters = {
        content_name: contentName,
        content_category: "SaaS B2B",
        segment,
        page_type: pageType,
      };
      trackMarketingEvent("landing_view", parameters, { eventId });
      trackMetaStandardEvent("ViewContent", parameters, eventId);
    }

    return () => refreshTimers.forEach((timer) => window.clearTimeout(timer));
  }, [contentName, pageType, segment]);

  return null;
}
