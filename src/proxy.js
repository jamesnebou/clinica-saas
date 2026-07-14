import { NextResponse } from "next/server";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|auth|dashboard|admin|login|login-cliente|onboarding|privacidade|termos).*)"],
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
  if (url.pathname === publicBasePath || url.pathname.startsWith(`${publicBasePath}/`)) {
    return NextResponse.next();
  }

  // No domínio personalizado, preserve a subpágina solicitada:
  // /loja -> /c/[slug]/loja, /checkout -> /c/[slug]/checkout etc.
  const requestedPath = url.pathname === "/" ? "" : url.pathname;
  url.pathname = `${publicBasePath}${requestedPath}`;
  return NextResponse.rewrite(url);
}
