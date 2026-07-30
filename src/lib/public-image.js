const SUPABASE_PUBLIC_OBJECT_PATH = "/storage/v1/object/public/";
const SUPABASE_PUBLIC_RENDER_PATH = "/storage/v1/render/image/public/";

function isTransformableSupabaseImage(url) {
  return url.hostname.endsWith(".supabase.co") && url.pathname.includes(SUPABASE_PUBLIC_OBJECT_PATH);
}

export function publicImageUrl(value, { width, height, quality = 72, resize = "cover" } = {}) {
  const source = String(value || "").trim();
  if (!source || (!width && !height)) return source;

  try {
    const url = new URL(source);
    if (!isTransformableSupabaseImage(url)) return source;

    url.pathname = url.pathname.replace(SUPABASE_PUBLIC_OBJECT_PATH, SUPABASE_PUBLIC_RENDER_PATH);
    if (width) url.searchParams.set("width", String(Math.round(width)));
    if (height) url.searchParams.set("height", String(Math.round(height)));
    url.searchParams.set("quality", String(Math.round(quality)));
    url.searchParams.set("resize", resize);
    return url.toString();
  } catch {
    return source;
  }
}

export function publicImageSrcSet(value, widths, options = {}) {
  const source = String(value || "").trim();
  if (!source || !Array.isArray(widths)) return undefined;

  try {
    const url = new URL(source);
    if (!isTransformableSupabaseImage(url)) return undefined;
  } catch {
    return undefined;
  }

  const { aspectRatio, ...transformOptions } = options;
  const candidates = widths
    .map((width) => Number(width))
    .filter((width) => Number.isFinite(width) && width > 0)
    .map((width) => {
      const height = aspectRatio ? Math.round(width / aspectRatio) : transformOptions.height;
      return `${publicImageUrl(source, { ...transformOptions, width, height })} ${width}w`;
    });

  return candidates.length > 1 ? candidates.join(", ") : undefined;
}
