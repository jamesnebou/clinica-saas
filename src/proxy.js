import { NextResponse } from "next/server";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|dashboard|admin|login|login-cliente|onboarding|privacidade|termos).*)"],
};

function isPlatformHost(host) {
  const value = String(host || "").toLowerCase().split(":")[0];
  if (!value) return true;
  if (value === "localhost" || value === "127.0.0.1") return true;
  if (value.endsWith(".vercel.app")) return true;
  const configured = String(process.env.APP_PRIMARY_HOSTS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(value);
}

async function findSlugByDomain(host) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const domain = String(host || "").toLowerCase().split(":")[0];

  if (!supabaseUrl || !serviceRoleKey || !domain) return null;

  const response = await fetch(`${supabaseUrl}/rest/v1/clinica_dominios?dominio=eq.${encodeURIComponent(domain)}&status=in.(ativo,verificado)&select=clinicas(slug)`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;
  const data = await response.json().catch(() => []);
  return data?.[0]?.clinicas?.slug || null;
}

export async function proxy(request) {
  const host = request.headers.get("host") || "";

  if (isPlatformHost(host)) {
    return NextResponse.next();
  }

  const slug = await findSlugByDomain(host);
  if (!slug) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/c/${slug}`;
  return NextResponse.rewrite(url);
}
