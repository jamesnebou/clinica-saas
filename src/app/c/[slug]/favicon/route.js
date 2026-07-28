import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { slug } = await params;
  const { data } = await supabaseAdmin
    .from("clinicas")
    .select("metadata")
    .eq("slug", slug)
    .maybeSingle();

  const faviconUrl = data?.metadata?.site_publico?.favicon_url || data?.metadata?.logo_url || null;

  if (!faviconUrl) {
    return NextResponse.redirect(new URL("/favicon.ico", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  }

  return NextResponse.redirect(faviconUrl, 307);
}