"use client";

import { buildFbc, GOOGLE_CLICK_ID_KEYS, normalizeMarketingAttribution, UTM_KEYS } from "./core.mjs";
import { getTrackingConsent } from "./consent";

const ATTRIBUTION_KEY = "nexawi_marketing_attribution";
const SESSION_KEY = "nexawi_marketing_session";

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
    // Storage pode estar bloqueado; tracking continua com o contexto da requisição atual.
  }
}

function removeStorage(storage, key) {
  try { storage.removeItem(key); } catch {}
}

function touchAllowedByConsent(touch = {}, consent = {}) {
  const result = {};
  for (const key of ["landing_page", "captured_at", "segment", "page_type"]) {
    if (touch[key]) result[key] = touch[key];
  }
  if (consent.analytics || consent.marketing) {
    for (const key of [...UTM_KEYS, "referrer"]) if (touch[key]) result[key] = touch[key];
  }
  if (consent.marketing) {
    for (const key of ["fbclid", "fbc", "fbp", ...GOOGLE_CLICK_ID_KEYS]) if (touch[key]) result[key] = touch[key];
  }
  return result;
}

function readCookie(name) {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const item = part.trim();
    if (item.startsWith(prefix)) return decodeURIComponent(item.slice(prefix.length));
  }
  return null;
}

function currentTouch({ segment, pageType } = {}) {
  if (typeof window === "undefined") return {};
  const query = new URLSearchParams(window.location.search);
  const touch = {
    landing_page: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || null,
    captured_at: new Date().toISOString(),
    segment: segment || null,
    page_type: pageType || null,
  };

  for (const key of UTM_KEYS) {
    const value = query.get(key)?.trim();
    if (value) touch[key] = value.slice(0, 160);
  }

  for (const key of GOOGLE_CLICK_ID_KEYS) {
    const value = query.get(key)?.trim();
    if (value) touch[key] = value.slice(0, 500);
  }

  const fbclid = query.get("fbclid")?.trim() || null;
  const cookieFbc = readCookie("_fbc");
  const cookieFbp = readCookie("_fbp");
  if (fbclid) touch.fbclid = fbclid.slice(0, 500);
  if (cookieFbp) touch.fbp = cookieFbp.slice(0, 500);
  // Um fbclid novo deve ganhar do _fbc antigo até o Pixel atualizar o cookie.
  touch.fbc = fbclid
    ? buildFbc({ fbclid, capturedAt: touch.captured_at })
    : buildFbc({ fbc: cookieFbc });
  return touch;
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

export function getMarketingAttribution() {
  if (typeof window === "undefined") return {};
  try {
    return normalizeMarketingAttribution(JSON.parse(safeStorage(window.localStorage, ATTRIBUTION_KEY) || "{}") || {});
  } catch {
    return {};
  }
}

export function captureMarketingAttribution(context = {}) {
  if (typeof window === "undefined") return {};
  const previous = getMarketingAttribution();
  const touch = currentTouch(context);
  const consent = getTrackingConsent();
  if (!consent.analytics && !consent.marketing) {
    removeStorage(window.localStorage, ATTRIBUTION_KEY);
    return normalizeMarketingAttribution({ segment: context.segment, page_type: context.pageType, consent });
  }
  const permittedTouch = {
    landing_page: touch.landing_page,
    captured_at: touch.captured_at,
    segment: touch.segment,
    page_type: touch.page_type,
    ...(consent.analytics || consent.marketing ? Object.fromEntries(UTM_KEYS.map((key) => [key, touch[key]]).filter(([, value]) => value)) : {}),
    ...(consent.marketing ? Object.fromEntries(["fbclid", "fbc", "fbp", ...GOOGLE_CLICK_ID_KEYS].map((key) => [key, touch[key]]).filter(([, value]) => value)) : {}),
    ...(consent.analytics || consent.marketing ? { referrer: touch.referrer } : {}),
  };
  // Cookie _fbc pode sobreviver a uma visita paga anterior. Só uma UTM nova ou um fbclid novo
  // deve substituir o last-touch; uma revisita direta não apaga a campanha que trouxe o usuário.
  const hasCampaign = Boolean(permittedTouch.utm_source || permittedTouch.utm_medium || permittedTouch.utm_campaign || permittedTouch.fbclid || GOOGLE_CLICK_ID_KEYS.some((key) => permittedTouch[key]));
  const previousFirst = touchAllowedByConsent(previous.first_touch, consent);
  const previousLast = touchAllowedByConsent(previous.last_touch, consent);
  const firstTouch = Object.keys(previousFirst).length ? previousFirst : permittedTouch;
  const lastTouch = hasCampaign || !Object.keys(previousLast).length ? permittedTouch : previousLast;

  // _fbp pode nascer logo após o bootstrap do Pixel. Atualizamos o identificador atual sem alterar a origem da campanha.
  const fbp = consent.marketing ? permittedTouch.fbp || previousLast.fbp || previousFirst.fbp || null : null;
  const fbc = consent.marketing ? permittedTouch.fbc || previousLast.fbc || previousFirst.fbc || null : null;

  const attribution = normalizeMarketingAttribution({
    first_touch: { ...firstTouch, ...(firstTouch.fbp ? {} : fbp ? { fbp } : {}), ...(firstTouch.fbc ? {} : fbc ? { fbc } : {}) },
    last_touch: { ...lastTouch, ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) },
    fbp,
    fbc,
    segment: context.segment || previous.segment || touch.segment,
    page_type: context.pageType || previous.page_type || touch.page_type,
    consent,
  });

  saveStorage(window.localStorage, ATTRIBUTION_KEY, JSON.stringify(attribution));
  return attribution;
}

export function refreshMetaCookieAttribution(context = {}) {
  return captureMarketingAttribution(context);
}

export function createMarketingEventId(prefix = "event") {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${String(prefix).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 32)}:${id}`;
}

export function fireMetaBrowserEvent(eventName, parameters = {}, eventId) {
  if (typeof window === "undefined" || !eventName) return false;
  if (!getTrackingConsent().marketing) return false;
  const execute = () => {
    if (typeof window.fbq !== "function") return false;
    window.fbq("track", eventName, parameters, eventId ? { eventID: eventId } : undefined);
    return true;
  };

  if (execute()) return true;
  let attempt = 0;
  const timer = window.setInterval(() => {
    attempt += 1;
    if (execute() || attempt >= 10) window.clearInterval(timer);
  }, 150);
  return false;
}

export function serializeMarketingAttribution(context = {}) {
  const attribution = captureMarketingAttribution(context);
  return JSON.stringify(attribution).slice(0, 12000);
}
