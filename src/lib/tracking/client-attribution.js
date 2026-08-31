"use client";

import { buildFbc, normalizeMarketingAttribution, UTM_KEYS } from "./core.mjs";

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
  // Cookie _fbc pode sobreviver a uma visita paga anterior. Só uma UTM nova ou um fbclid novo
  // deve substituir o last-touch; uma revisita direta não apaga a campanha que trouxe o usuário.
  const hasCampaign = Boolean(touch.utm_source || touch.utm_medium || touch.utm_campaign || touch.fbclid);
  const firstTouch = Object.keys(previous.first_touch || {}).length ? previous.first_touch : touch;
  const lastTouch = hasCampaign || !Object.keys(previous.last_touch || {}).length ? touch : previous.last_touch;

  // _fbp pode nascer logo após o bootstrap do Pixel. Atualizamos o identificador atual sem alterar a origem da campanha.
  const fbp = touch.fbp || previous.fbp || previous.last_touch?.fbp || previous.first_touch?.fbp || null;
  const fbc = touch.fbc || previous.fbc || previous.last_touch?.fbc || previous.first_touch?.fbc || null;

  const attribution = normalizeMarketingAttribution({
    ...previous,
    first_touch: { ...firstTouch, ...(firstTouch.fbp ? {} : fbp ? { fbp } : {}), ...(firstTouch.fbc ? {} : fbc ? { fbc } : {}) },
    last_touch: { ...lastTouch, ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) },
    fbp,
    fbc,
    segment: context.segment || previous.segment || touch.segment,
    page_type: context.pageType || previous.page_type || touch.page_type,
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
