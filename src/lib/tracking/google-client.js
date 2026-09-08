"use client";

import { getTrackingConsent } from "./consent";

const GA4_NAMES = Object.freeze({ landing_view: "page_view", cta_click: "select_content", demo_click: "select_content", pricing_click: "select_item", whatsapp_click: "contact", lead_submit: "generate_lead", signup_started: "begin_checkout", signup_completed: "sign_up" });

function conversionLabel(name) {
  return { lead_submit: process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL, signup_completed: process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL }[name] || null;
}

export function fireGoogleAnalyticsEvent(eventName, parameters = {}) {
  if (typeof window === "undefined" || !getTrackingConsent().analytics || typeof window.gtag !== "function") return false;
  window.gtag("event", GA4_NAMES[eventName] || eventName, { ...parameters, nexawi_event_name: eventName });
  return true;
}

export function fireGoogleAdsConversion(eventName, parameters = {}) {
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const label = conversionLabel(eventName);
  if (typeof window === "undefined" || !getTrackingConsent().marketing || !adsId || !label || typeof window.gtag !== "function") return false;
  window.gtag("event", "conversion", { ...parameters, send_to: `${adsId}/${label}` });
  return true;
}

export function setGoogleEnhancedUserData({ email, phone, firstName, lastName } = {}) {
  if (typeof window === "undefined" || !getTrackingConsent().marketing || typeof window.gtag !== "function") return false;
  const userData = {};
  if (email) userData.email = String(email).trim().toLowerCase();
  if (phone) userData.phone_number = String(phone).replace(/\D/g, "");
  if (firstName) userData.first_name = String(firstName).trim().toLowerCase();
  if (lastName) userData.last_name = String(lastName).trim().toLowerCase();
  if (!Object.keys(userData).length) return false;
  window.gtag("set", "user_data", userData);
  return true;
}
