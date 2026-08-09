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

function buildSingleProjectDomainUrl({ project, teamId, teamSlug }, domain) {
  const url = new URL(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}`, VERCEL_API_BASE_URL);
  if (teamId) url.searchParams.set("teamId", teamId);
  if (teamSlug) url.searchParams.set("slug", teamSlug);
  return url.toString();
}

function responseMessage(payload, fallback) {
  return payload?.error?.message || payload?.message || fallback;
}

function domainResultFromPayload(payload, fallbackMessage = "") {
  const verified = Boolean(payload?.verified);

  return {
    configured: true,
    ok: true,
    status: verified ? "ativo" : "pendente",
    verified,
    payload,
    message: verified ? "Domínio encontrado e verificado na Vercel." : fallbackMessage || "Domínio encontrado na Vercel. Aguarde ou configure o DNS para verificar.",
  };
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
    const message = responseMessage(payload, "Não foi possível adicionar o domínio na Vercel.");
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
    message: verified ? "Domínio adicionado e verificado na Vercel." : "Domínio adicionado na Vercel. Aguarde ou configure o DNS para verificar.",
  };
}

export async function getVercelProjectDomain(domain) {
  const config = vercelConfig();
  const normalizedDomain = normalizeCustomDomain(domain);

  if (!normalizedDomain) {
    return {
      configured: false,
      ok: false,
      missing: false,
      status: "pendente",
      message: "Informe um dominio valido para consultar.",
    };
  }

  if (!config.token || !config.project) {
    return {
      configured: false,
      ok: false,
      missing: false,
      status: "pendente",
      message: "Integracao Vercel nao configurada. Defina VERCEL_API_TOKEN e VERCEL_PROJECT_ID_OR_NAME.",
    };
  }

  const response = await fetch(buildSingleProjectDomainUrl(config, normalizedDomain), {
    method: "GET",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (response.status === 404) {
    return {
      configured: true,
      ok: false,
      missing: true,
      status: "inativo",
      verified: false,
      payload,
      message: "Domínio não está mais vinculado ao projeto na Vercel.",
    };
  }

  if (!response.ok) {
    return {
      configured: true,
      ok: false,
      missing: false,
      status: "erro",
      verified: false,
      payload,
      message: responseMessage(payload, "Não foi possível consultar o domínio na Vercel."),
    };
  }

  return domainResultFromPayload(payload);
}

export async function ensureVercelProjectDomain(domain) {
  const existing = await getVercelProjectDomain(domain);
  if (existing.ok) return existing;
  if (existing.configured && existing.missing) {
    return addVercelProjectDomain(domain);
  }
  return existing;
}

export async function removeVercelProjectDomain(domain) {
  const config = vercelConfig();
  const normalizedDomain = normalizeCustomDomain(domain);

  if (!normalizedDomain) {
    return {
      configured: false,
      ok: false,
      message: "Informe um dominio valido para remover.",
    };
  }

  if (!config.token || !config.project) {
    return {
      configured: false,
      ok: true,
      message: "Integracao Vercel nao configurada. O vinculo local sera removido.",
    };
  }

  const response = await fetch(buildSingleProjectDomainUrl(config, normalizedDomain), {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return {
      configured: true,
      ok: true,
      message: "Domínio já não estava vinculado ao projeto na Vercel.",
    };
  }

  const payload = await response.json().catch(() => null);

  return {
    configured: true,
    ok: response.ok,
    payload,
    message: response.ok ? "Domínio removido da Vercel." : responseMessage(payload, "Não foi possível remover o domínio na Vercel."),
  };
}
