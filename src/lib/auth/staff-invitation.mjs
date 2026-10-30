export function canAcceptStaffInvitation(membership, user, now = new Date()) {
  if (!membership || !user || membership.ativo || membership.accepted_at) return false;
  const expiresAt = new Date(membership.invite_expires_at || "");
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) return false;
  const email = String(user.email || "").trim().toLowerCase();
  return Boolean(membership.user_id && membership.user_id === user.id && email === String(membership.email || "").trim().toLowerCase());
}
