import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashOpaqueToken } from "@/lib/whatsapp/core.mjs";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const { token } = await params;
  const tokenHash = hashOpaqueToken(String(token || ""));
  const { data: interaction } = await supabaseAdmin
    .from("whatsapp_interaction_tokens")
    .select("id,clinica_id,agendamento_id,expires_at")
    .eq("token_hash", tokenHash)
    .eq("action", "payment")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!interaction) return new NextResponse("Link de pagamento inválido ou expirado.", { status: 410 });

  const { data: booking } = await supabaseAdmin
    .from("site_agendamentos_publicos")
    .select("id,invoice_url,pagamento_status")
    .eq("clinica_id", interaction.clinica_id)
    .eq("agendamento_id", interaction.agendamento_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!booking?.invoice_url || booking.pagamento_status !== "pendente") {
    return new NextResponse("Este pagamento não está mais pendente.", { status: 410 });
  }

  let destination;
  try {
    destination = new URL(booking.invoice_url);
    if (destination.protocol !== "https:") throw new Error("invalid_protocol");
  } catch {
    return new NextResponse("Checkout indisponível.", { status: 502 });
  }

  await supabaseAdmin.from("eventos_analiticos").insert({
    clinica_id: interaction.clinica_id,
    event_name: "payment_link_clicked",
    metadata: { agendamento_id: interaction.agendamento_id, public_booking_id: booking.id, channel: "whatsapp" },
  });

  return NextResponse.redirect(destination, 302);
}
