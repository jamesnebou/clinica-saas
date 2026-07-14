import { supabaseAdmin } from "@/lib/supabase/admin";

export const CLIENT_PHOTOS_BUCKET = "cliente-fotos";
export const CLINIC_LOGOS_BUCKET = "clinica-logos";
export const CLINIC_SITE_IMAGES_BUCKET = "clinica-site-images";

const MAX_CLIENT_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_CLINIC_LOGO_BYTES = 30 * 1024 * 1024;
const MAX_CLINIC_SITE_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PROCEDURE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_MARKETING_HOME_IMAGE_BYTES = 20 * 1024 * 1024;

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

  if (file.size > MAX_CLIENT_PHOTO_BYTES) {
    throw new Error("A imagem precisa ter no maximo 10 MB.");
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

export async function uploadClinicLogo({ clinicaId, file }) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
    return null;
  }

  if (!file.type?.startsWith("image/")) {
    throw new Error("Envie apenas arquivos de imagem para a logo.");
  }

  if (file.size > MAX_CLINIC_LOGO_BYTES) {
    throw new Error("A logo precisa ter no maximo 30 MB.");
  }

  const extension = file.name?.includes(".") ? file.name.split(".").pop() : "jpg";
  const filename = `${Date.now()}-${sanitizeFileName(file.name || `logo.${extension}`)}`;
  const path = `${clinicaId}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage
    .from(CLINIC_LOGOS_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabaseAdmin.storage.from(CLINIC_LOGOS_BUCKET).getPublicUrl(path);

  return {
    path,
    publicUrl: data?.publicUrl || "",
    mimeType: file.type || null,
    size: file.size || null,
  };
}

export async function uploadClinicSiteImage({ clinicaId, file, slot }) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
    return null;
  }

  if (!file.type?.startsWith("image/")) {
    throw new Error("Envie apenas arquivos de imagem para o site.");
  }

  if (file.size > MAX_CLINIC_SITE_IMAGE_BYTES) {
    throw new Error("A imagem do site precisa ter no maximo 50 MB.");
  }

  const safeSlot = sanitizeFileName(slot || "site");
  const extension = file.name?.includes(".") ? file.name.split(".").pop() : "jpg";
  const filename = `${Date.now()}-${sanitizeFileName(file.name || `${safeSlot}.${extension}`)}`;
  const path = `${clinicaId}/${safeSlot}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage
    .from(CLINIC_SITE_IMAGES_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabaseAdmin.storage.from(CLINIC_SITE_IMAGES_BUCKET).getPublicUrl(path);

  return {
    path,
    publicUrl: data?.publicUrl || "",
    mimeType: file.type || null,
    size: file.size || null,
  };
}

export async function uploadMarketingHomeImage({ file }) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
    return null;
  }

  if (!["image/jpeg", "image/png"].includes(file.type)) {
    throw new Error("Envie a imagem da home em PNG ou JPEG.");
  }

  if (file.size > MAX_MARKETING_HOME_IMAGE_BYTES) {
    throw new Error("A imagem da home precisa ter no máximo 20 MB.");
  }

  const extension = file.name?.includes(".") ? file.name.split(".").pop() : "jpg";
  const filename = Date.now() + "-" + sanitizeFileName(file.name || "home." + extension);
  const path = "marketing/home/" + filename;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage
    .from(CLINIC_SITE_IMAGES_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabaseAdmin.storage.from(CLINIC_SITE_IMAGES_BUCKET).getPublicUrl(path);

  return {
    path,
    publicUrl: data?.publicUrl || "",
    mimeType: file.type || null,
    size: file.size || null,
  };
}

export async function uploadProductImage({ clinicaId, produtoId = "novo", file }) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Envie a imagem do produto em JPG, PNG ou WebP.");
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) throw new Error("A imagem do produto precisa ter no máximo 10 MB.");
  const extension = file.name?.includes(".") ? file.name.split(".").pop() : "jpg";
  const filename = `${Date.now()}-${sanitizeFileName(file.name || `produto.${extension}`)}`;
  const path = `${clinicaId}/produtos/${produtoId}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage.from(CLINIC_SITE_IMAGES_BUCKET).upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) throw error;
  const { data } = supabaseAdmin.storage.from(CLINIC_SITE_IMAGES_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data?.publicUrl || "", mimeType: file.type || null, size: file.size || null };
}

export async function uploadProcedureImage({ clinicaId, procedimentoId = "novo", file }) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
    return null;
  }

  if (!file.type?.startsWith("image/")) {
    throw new Error("Envie apenas arquivos de imagem para o procedimento.");
  }

  if (file.size > MAX_PROCEDURE_IMAGE_BYTES) {
    throw new Error("A imagem do procedimento precisa ter no máximo 10 MB.");
  }

  const extension = file.name?.includes(".") ? file.name.split(".").pop() : "jpg";
  const filename = `${Date.now()}-${sanitizeFileName(file.name || `procedimento.${extension}`)}`;
  const path = `${clinicaId}/procedimentos/${procedimentoId}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage
    .from(CLINIC_SITE_IMAGES_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabaseAdmin.storage.from(CLINIC_SITE_IMAGES_BUCKET).getPublicUrl(path);

  return {
    path,
    publicUrl: data?.publicUrl || "",
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
