export const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  recepcao: "Recepção",
  financeiro: "Financeiro",
  profissional: "Profissional",
};

export const ACCESS_SECTION_LABELS = [
  ["dashboard", "Visão geral"],
  ["agenda", "Agenda"],
  ["notificacoes", "Notificações"],
  ["clientes", "Clientes"],
  ["crm", "CRM"],
  ["profissionais", "Profissionais"],
  ["procedimentos", "Procedimentos"],
  ["usuarios", "Usuários"],
  ["configuracoes", "Configurações"],
  ["financeiro", "Financeiro"],
  ["assinatura", "Assinatura"],
];

export const ACCESS_SECTIONS = ACCESS_SECTION_LABELS.map(([section]) => section);

export const ROLE_ACCESS = {
  owner: ["dashboard", "agenda", "notificacoes", "clientes", "crm", "profissionais", "procedimentos", "usuarios", "configuracoes", "financeiro", "assinatura"],
  admin: ["dashboard", "agenda", "notificacoes", "clientes", "crm", "profissionais", "procedimentos", "usuarios", "configuracoes", "financeiro", "assinatura"],
  recepcao: ["dashboard", "agenda", "notificacoes", "clientes", "crm", "profissionais", "procedimentos"],
  financeiro: ["dashboard", "notificacoes", "clientes", "crm", "financeiro", "assinatura"],
  profissional: ["dashboard", "agenda", "notificacoes", "clientes", "crm", "procedimentos"],
};

export function getCurrentMembership(memberships, clinicaId) {
  return (memberships || []).find((item) => item.clinica_id === clinicaId) || memberships?.[0] || null;
}

export function getCustomAccessSections(membership) {
  const sections = membership?.permissoes?.secoes;
  if (!Array.isArray(sections)) return null;

  const validSections = sections.filter((section) => ACCESS_SECTIONS.includes(section));
  return validSections.length ? validSections : null;
}

export function canAccessSection(role, section, membership = null) {
  if (role === "owner") return true;

  const customSections = getCustomAccessSections(membership);
  if (customSections) {
    return customSections.includes(section);
  }

  return Boolean(ROLE_ACCESS[role]?.includes(section));
}

export function assertSectionAccess(role, section, membership = null) {
  if (!canAccessSection(role, section, membership)) {
    const label = ROLE_LABELS[role] || "Usuário";
    throw new Error(`${label} não tem permissão para acessar esta área.`);
  }
}
