const VERCEL_API_BASE_URL = "https://api.vercel.com";

function vercelConfig() {
  return {
    token: process.env.VERCEL_API_TOKEN,
    project: process.env.VERCEL_PROJECT_ID_OR_NAME,
    teamId: process.env.VERCEL_TEAM_ID,
    teamSlug: process.env.VERCEL_TEAM_SLUG,
  };
}

function buildProjectDomainUrl({ project, teamId, teamSlug }) {
  const url = new URL(`/v10/projects/${encodeURIComponent(project)}/domains`, VERCEL_API_BASE_URL);
  if (teamId) url.searchParams.set("teamId", teamId);
  if (teamSlug) url.searchParams.set("slug", teamSlug);
  return url.toString();
}

function responseMessage(payload, fallback) {
  return payload?.error?.message || payload?.message || fallback;
}

export function normalizeCustomDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\.\s+/i, "www.")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

export function isVercelDomainAutomationConfigured() {
  const config = vercelConfig();
  return Boolean(config.token && config.project);
}

export async function addVercelProjectDomain(domain) {
  const config = vercelConfig();
  const normalizedDomain = normalizeCustomDomain(domain);

  if (!normalizedDomain) {
    return {
      configured: false,
      ok: false,
      status: "pendente",
      message: "Informe um dominio valido para configurar.",
    };
  }

  if (!config.token || !config.project) {
    return {
      configured: false,
      ok: false,
      status: "pendente",
      message: "Integracao Vercel nao configurada. Defina VERCEL_API_TOKEN e VERCEL_PROJECT_ID_OR_NAME.",
    };
  }

  const response = await fetch(buildProjectDomainUrl(config), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: normalizedDomain }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = responseMessage(payload, "Nao foi possivel adicionar o dominio na Vercel.");
    const alreadyExists = /already|exists|ja existe|já existe/i.test(message);

    return {
      configured: true,
      ok: alreadyExists,
      status: alreadyExists ? "pendente" : "erro",
      verified: false,
      payload,
      message,
    };
  }

  const verified = Boolean(payload?.verified);

  return {
    configured: true,
    ok: true,
    status: verified ? "ativo" : "pendente",
    verified,
    payload,
    message: verified ? "Dominio adicionado e verificado na Vercel." : "Dominio adicionado na Vercel. Aguarde ou configure o DNS para verificar.",
  };
}
