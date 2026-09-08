"use client";

import { normalizeConsent } from "./core.mjs";

export const CONSENT_STORAGE_KEY = "nexawi_tracking_consent_v1";
export const CONSENT_EVENT = "nexawi:consent-changed";

export function getTrackingConsent() {
  if (typeof window === "undefined") return normalizeConsent();
  try {
    return normalizeConsent(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) || "{}"));
  } catch {
    return normalizeConsent();
  }
}

export function saveTrackingConsent(input) {
  if (typeof window === "undefined") return normalizeConsent(input);
  const consent = normalizeConsent({ ...input, decided: true, updated_at: new Date().toISOString() });
  try { window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent)); } catch {}
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: consent }));
  return consent;
}

export function googleConsentState(consent = {}) {
  const normalized = normalizeConsent(consent);
  return {
    analytics_storage: normalized.analytics ? "granted" : "denied",
    ad_storage: normalized.marketing ? "granted" : "denied",
    ad_user_data: normalized.marketing ? "granted" : "denied",
    ad_personalization: normalized.marketing ? "granted" : "denied",
  };
}
