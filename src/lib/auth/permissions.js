export const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  recepcao: "Recepcao",
  financeiro: "Financeiro",
  profissional: "Profissional",
};

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

export function canAccessSection(role, section) {
  return Boolean(ROLE_ACCESS[role]?.includes(section));
}

export function assertSectionAccess(role, section) {
  if (!canAccessSection(role, section)) {
    const label = ROLE_LABELS[role] || "Usuario";
    throw new Error(`${label} nao tem permissao para acessar esta area.`);
  }
}
