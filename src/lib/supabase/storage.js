import { supabaseAdmin } from "@/lib/supabase/admin";

export const CLIENT_PHOTOS_BUCKET = "cliente-fotos";

function sanitizeFileName(name = "foto") {
  return String(name || "foto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "foto";
}

export async function uploadClientPhoto({ clinicaId, clienteId, file }) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
    throw new Error("Selecione uma imagem para upload.");
  }

  if (!file.type?.startsWith("image/")) {
    throw new Error("Envie apenas arquivos de imagem.");
  }

  const extension = file.name?.includes(".") ? file.name.split(".").pop() : "jpg";
  const filename = `${Date.now()}-${sanitizeFileName(file.name || `foto.${extension}`)}`;
  const path = `${clinicaId}/${clienteId}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage
    .from(CLIENT_PHOTOS_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (error) throw error;

  return {
    path,
    mimeType: file.type || null,
    size: file.size || null,
  };
}

export async function createSignedPhotoUrl(storagePath) {
  if (!storagePath) return "";

  const { data, error } = await supabaseAdmin.storage
    .from(CLIENT_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error) {
    console.error("Erro ao assinar URL da foto:", error);
    return "";
  }

  return data?.signedUrl || "";
}
