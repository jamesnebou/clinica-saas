export function isOwnedClientPhotoPath(path, clinicaId, clienteId) {
  const parts = String(path || "").split("/");
  return parts.length === 3 && parts[0] === clinicaId && parts[1] === clienteId &&
    Boolean(parts[2]) && parts[2] !== "." && parts[2] !== ".." && !parts[2].includes("\\");
}
