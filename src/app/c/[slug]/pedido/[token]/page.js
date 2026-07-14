/* eslint-disable @next/next/no-img-element */

import { CheckCircle2, Clock3, CreditCard, MapPin, PackageCheck, RefreshCw, ShoppingBag, Truck } from "lucide-react";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ClearPurchasedCart } from "./order-complete-client";

export const dynamic = "force-dynamic";

const statusInfo = {
  aguardando_pagamento: [Clock3, "Aguardando pagamento", "Conclua o pagamento para reservar definitivamente os produtos."],
  confirmado: [CheckCircle2, "Pedido confirmado", "A clínica recebeu seu pedido e iniciará a preparação."],
  em_separacao: [PackageCheck, "Em separação", "Os produtos estão sendo preparados."],
  pronto_retirada: [ShoppingBag, "Pronto para retirada", "Seu pedido já pode ser retirado na clínica."],
  enviado: [Truck, "Pedido enviado", "Seu pedido saiu para entrega."],
  concluido: [CheckCircle2, "Pedido concluído", "Obrigado por comprar com a clínica."],
  cancelado: [Clock3, "Pedido cancelado", "A reserva dos produtos foi liberada."],
  estornado: [CreditCard, "Pagamento estornado", "O pagamento foi devolvido e o estoque foi atualizado."],
};

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-";
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return { title: `Pedido | ${slug}` };
}

export default async function PublicOrderPage({ params }) {
  const { slug, token } = await params;
  const { data: clinic } = await supabaseAdmin.from("clinicas").select("id, nome, slug, telefone, endereco, cidade, estado, metadata").eq("slug", slug).maybeSingle();
  if (!clinic) notFound();

  const { data: order, error } = await supabaseAdmin
    .from("pedidos_clinica")
    .select("id, numero, token_publico, status, pagamento_status, entrega_tipo, nome_cliente, telefone_cliente, subtotal, desconto, frete, total, cupom_codigo, forma_pagamento, invoice_url, expiracao_reserva_em, pago_em, created_at, cep, endereco, numero_endereco, complemento, bairro, cidade, estado, referencia_entrega, itens:pedido_itens_clinica(id, nome_produto, sku, imagem_url, quantidade, valor_unitario, total)")
    .eq("clinica_id", clinic.id)
    .eq("token_publico", token)
    .maybeSingle();
  if (error) throw error;
  if (!order) notFound();

  const [StatusIcon, statusLabel, statusDescription] = statusInfo[order.status] || statusInfo.aguardando_pagamento;
  const primary = clinic.metadata?.primary_color || "#2e3a2d";
  const accent = clinic.metadata?.accent_color || "#d99bae";
  const brandName = clinic.metadata?.brand_name || clinic.nome;
  const pickupAddress = [clinic.endereco, clinic.cidade, clinic.estado].filter(Boolean).join(" - ");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,color-mix(in_srgb,var(--clinic-accent)_18%,transparent),transparent_34rem),linear-gradient(145deg,#fffaf5,#eee7de)] px-5 py-10 text-[#181510] sm:px-8" style={{ "--clinic-primary": primary, "--clinic-accent": accent }}>
      <ClearPurchasedCart slug={slug} />
      <div className="mx-auto max-w-5xl">
        <a href={`/c/${slug}`} className="text-sm font-bold text-[var(--clinic-primary)]">← Voltar ao site</a>
        <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 shadow-[0_30px_90px_rgba(23,19,15,0.14)] backdrop-blur">
          <div className="bg-[#17130f] p-7 text-white sm:p-10">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[var(--clinic-accent)]">{brandName}</p>
            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold sm:text-4xl">Pedido #{order.numero}</h1>
                <p className="mt-2 text-sm text-white/55">Criado em {dateTime(order.created_at)}</p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/7 px-5 py-4"><StatusIcon className="text-[var(--clinic-accent)]" size={25} /><div><strong className="block">{statusLabel}</strong><span className="mt-1 block text-xs text-white/55">{order.pagamento_status === "pago" ? "Pagamento confirmado" : order.pagamento_status === "pagar_na_retirada" ? "Pagamento na retirada" : "Pagamento pendente"}</span></div></div>
            </div>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-white/65">{statusDescription}</p>
            {order.status === "aguardando_pagamento" && order.expiracao_reserva_em ? <p className="mt-3 text-xs font-bold text-amber-200">Reserva válida até {dateTime(order.expiracao_reserva_em)}.</p> : null}
            {order.invoice_url && order.pagamento_status === "pendente" ? <a href={order.invoice_url} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--clinic-accent)] px-6 py-3 text-sm font-black text-[#17130f]"><CreditCard size={18} /> Continuar pagamento</a> : null}
          </div>

          <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <h2 className="text-lg font-black">Produtos</h2>
              <div className="mt-5 space-y-4">{(order.itens || []).map((item) => <article key={item.id} className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100">{item.imagem_url ? <img src={item.imagem_url} alt="" className="h-full w-full object-cover" /> : <ShoppingBag size={23} className="text-neutral-400" />}</div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold">{item.nome_produto}</h3><p className="mt-1 text-xs text-neutral-500">{item.quantidade} × {money(item.valor_unitario)}</p></div><strong className="text-sm text-[var(--clinic-primary)]">{money(item.total)}</strong></article>)}</div>
            </div>
            <aside>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-5">
                <h2 className="text-sm font-black">Resumo financeiro</h2>
                <div className="mt-4 space-y-3 text-sm"><div className="flex justify-between text-neutral-600"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>{Number(order.desconto) > 0 ? <div className="flex justify-between text-emerald-700"><span>Desconto {order.cupom_codigo ? `(${order.cupom_codigo})` : ""}</span><span>- {money(order.desconto)}</span></div> : null}<div className="flex justify-between text-neutral-600"><span>Entrega</span><span>{Number(order.frete) ? money(order.frete) : "Grátis"}</span></div><div className="flex justify-between border-t border-neutral-200 pt-4 text-lg"><strong>Total</strong><strong className="text-[var(--clinic-primary)]">{money(order.total)}</strong></div></div>
              </div>
              <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
                <h2 className="flex items-center gap-2 text-sm font-black"><MapPin size={17} className="text-[var(--clinic-primary)]" />{order.entrega_tipo === "entrega" ? "Endereço de entrega" : "Retirada"}</h2>
                <p className="mt-3 text-sm leading-6 text-neutral-600">{order.entrega_tipo === "entrega" ? [order.endereco, order.numero_endereco, order.complemento, order.bairro, order.cidade, order.estado, order.cep].filter(Boolean).join(" - ") : pickupAddress || "Confirme o endereço com a clínica."}</p>
              </div>
              <a href={`/c/${slug}/pedido/${token}`} className="mt-4 flex items-center justify-center gap-2 rounded-full border border-neutral-300 px-5 py-3 text-sm font-bold text-neutral-700"><RefreshCw size={16} /> Atualizar status</a>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
