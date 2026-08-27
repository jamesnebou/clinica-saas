import { matchesDemoEmail } from "@/lib/domain/demo-core.mjs";

export const DEMO_EMAIL = String(process.env.DEMO_EMAIL || "demo@nexawi.com.br").trim().toLowerCase();
export const DEMO_PASSWORD = String(process.env.DEMO_PASSWORD || "demo1234");
export const DEMO_SLUG = String(process.env.DEMO_CLINIC_SLUG || "demo-nexawi-clinicas").trim().toLowerCase();
export const DEMO_CLINIC_NAME = "NexaWi Clínicas Demo";

export function isDemoLoginEmail(email) {
  return matchesDemoEmail(email, DEMO_EMAIL);
}

export function isDemoPassword(password) {
  return String(password || "") === DEMO_PASSWORD;
}

export function isDemoClinic(clinic) {
  const slug = String(clinic?.slug || clinic || "").trim().toLowerCase();
  const metadata = clinic && typeof clinic === "object" ? clinic.metadata || {} : {};
  return slug === DEMO_SLUG && metadata.demo === true;
}
