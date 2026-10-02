export async function removeOwnedClinicDomain({ clinicId, domain, database, removeRemote }) {
  if (!clinicId) return { status: "unauthorized" };

  const { data: ownedDomain, error: lookupError } = await database
    .from("clinica_dominios")
    .select("id, clinica_id, dominio")
    .eq("clinica_id", clinicId)
    .eq("dominio", domain)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!ownedDomain || ownedDomain.clinica_id !== clinicId || ownedDomain.dominio !== domain) {
    return { status: "not_found" };
  }

  let remoteResult;
  try {
    remoteResult = await removeRemote(ownedDomain.dominio);
  } catch {
    return { status: "remote_failed" };
  }
  if (remoteResult?.ok !== true) return { status: "remote_failed" };

  const { data: deletedDomain, error: deleteError } = await database
    .from("clinica_dominios")
    .delete()
    .eq("id", ownedDomain.id)
    .eq("clinica_id", clinicId)
    .eq("dominio", ownedDomain.dominio)
    .select("id")
    .maybeSingle();

  if (deleteError) throw deleteError;
  return { status: deletedDomain ? "removed" : "local_failed" };
}
