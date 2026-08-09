export function customSectionsFromMembership(membership, validSections = []) {
  const sections = membership?.permissoes?.secoes;
  if (!Array.isArray(sections)) return null;
  const valid = sections.filter((section) => validSections.includes(section));
  return valid.length ? valid : null;
}

export function canAccessByPolicy({ role, section, membership, validSections, roleAccess, ownerRole = "owner" }) {
  if (role === ownerRole) return true;
  const custom = customSectionsFromMembership(membership, validSections);
  return custom ? custom.includes(section) : Boolean(roleAccess?.[role]?.includes(section));
}
