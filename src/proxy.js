import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/dashboard-admin/:path*",
    "/admin/:path*",
    "/login/:path*",
    "/login-cliente/:path*",
    "/cadastro/:path*",
    "/onboarding/:path*",
    "/((?!_next/static|_next/image|api|auth|dashboard|admin|login|login-cliente|cadastro|onboarding|privacidade|termos).*)",
  ],
};

const SESSION_AWARE_PREFIXES = [
  "/dashboard",
  "/dashboard-admin",
  "/admin",
  "/login",
  "/login-cliente",
  "/cadastro",
  "/onboarding",
];

function isSessionAwarePath(pathname) {
  return SESSION_AWARE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

async function refreshAuthSession(request) {
  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers = {}) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // Server Components não conseguem persistir tokens renovados; o Proxy precisa fazê-lo antes delas.
  await supabase.auth.getClaims();
  return response;
}

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
  const withoutWww = domain.replace(/^www\./, "");
  const candidates = Array.from(new Set([domain, withoutWww, `www.${withoutWww}`].filter(Boolean)));

  if (!supabaseUrl || !serviceRoleKey || !domain) return null;

  const encodedCandidates = candidates.map((item) => `"${item.replaceAll('"', '\\"')}"`).join(",");
  const response = await fetch(`${supabaseUrl}/rest/v1/clinica_dominios?dominio=in.(${encodedCandidates})&status=in.(ativo,verificado,pendente)&select=dominio,status,clinicas(slug)`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;
  const data = await response.json().catch(() => []);
  const exact = data?.find((item) => item.dominio === domain);
  const verified = data?.find((item) => ["ativo", "verificado"].includes(item.status));
  return exact?.clinicas?.slug || verified?.clinicas?.slug || data?.[0]?.clinicas?.slug || null;
}

export async function proxy(request) {
  if (isSessionAwarePath(request.nextUrl.pathname)) {
    return refreshAuthSession(request);
  }

  const host = request.headers.get("host") || "";

  if (isPlatformHost(host)) {
    return NextResponse.next();
  }

  const slug = await findSlugByDomain(host);
  if (!slug) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  const publicBasePath = `/c/${slug}`;

  // Links internos já usam a rota canônica com o slug.
  // Não os reescreva para a página inicial novamente.
  if (url.pathname === "/favicon.ico") {
    url.pathname = `${publicBasePath}/favicon`;
    return NextResponse.rewrite(url);
  }
  if (url.pathname === publicBasePath || url.pathname.startsWith(`${publicBasePath}/`)) {
    return NextResponse.next();
  }

  // No domínio personalizado, preserve a subpágina solicitada:
  // /loja -> /c/[slug]/loja, /checkout -> /c/[slug]/checkout etc.
  const requestedPath = url.pathname === "/" ? "" : url.pathname;
  url.pathname = `${publicBasePath}${requestedPath}`;
  return NextResponse.rewrite(url);
}
