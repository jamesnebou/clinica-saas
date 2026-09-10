import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  isExpectedBrokerOrigin,
  isPlatformReturnOrigin,
  normalizeHttpOrigin,
  requestOriginFromHeaders,
} from "./broker-core.mjs";

function appOrigins() {
  return [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL, process.env.NEXT_PUBLIC_SITE_URL];
}

export function getMetaConnectOrigin() {
  const origin = normalizeHttpOrigin(process.env.META_CONNECT_ORIGIN);
  if (!origin) throw new Error("Origem central de conexão da Meta não configurada.");
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) {
    throw new Error("Origem central de conexão da Meta deve usar HTTPS.");
  }
  return origin;
}

export function getRequestOrigin(request) {
  return requestOriginFromHeaders({
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    fallbackUrl: request.url,
  });
}

export function isMetaConnectRequestOrigin(origin) {
  return isExpectedBrokerOrigin(origin, getMetaConnectOrigin());
}

export async function resolveClinicReturnOrigin({ clinicId, requestOrigin }) {
  const origin = normalizeHttpOrigin(requestOrigin);
  if (!origin) throw new Error("Origem do dashboard inválida.");
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) {
    throw new Error("Origem do dashboard deve usar HTTPS.");
  }

  if (isPlatformReturnOrigin(origin, {
    primaryHosts: process.env.APP_PRIMARY_HOSTS,
    appOrigins: appOrigins(),
    vercelEnvironment: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
  })) return origin;

  const hostname = new URL(origin).hostname.toLowerCase();
  const withoutWww = hostname.replace(/^www\./, "");
  const candidates = [...new Set([hostname, withoutWww, `www.${withoutWww}`])];
  const { data, error } = await supabaseAdmin
    .from("clinica_dominios")
    .select("id")
    .eq("clinica_id", clinicId)
    .in("dominio", candidates)
    .in("status", ["ativo", "verificado"])
    .limit(1);
  if (error) throw error;
  if (!data?.length) throw new Error("Este domínio não pertence à clínica autenticada.");
  return origin;
}
