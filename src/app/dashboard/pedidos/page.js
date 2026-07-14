import { CreditCard, PackageCheck, Percent, RotateCcw, ShoppingBag, Tag, Truck, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireClinicSection } from "@/lib/auth/session";
import { EmptyClinicState, Field, Notice, PageHeader, SelectField, SubmitButton } from "@/components/app-shell/ui";
import { confirmPickupPaymentAction, createStoreCouponAction, openAbandonedCartRecoveryAction, requestStoreOrderRefundAction, toggleStoreCouponAction, updateStoreOrderStatusAction } from "./actions";

export const metadata = { title: "Pedidos da Lojinha | NexaWi Clínicas" };

const labels = {
  aguardando_pagamento: "Aguardando pagamento", confirmado: "Confirmado", em_separacao: "Em separação",
  pronto_retirada: "Pronto para retirada", enviado: "Enviado", concluido: "Concluído", cancelado: "Cancelado", estornado: "Estornado",
};

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-";
}

export default async function StoreOrdersPage({ searchParams }) {
  const query = await searchParams;
  const { activeClinic } = await requireClinicSection("pedidos");
  if (!activeClinic) return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;

  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const [ordersResult, cartsResult, couponsResult] = await Promise.all([
    supabase.from("pedidos_clinica").select("id, numero, token_publico, cliente_id, status, pagamento_status, entrega_tipo, nome_cliente, telefone_cliente, email_cliente, subtotal, desconto, frete, total, cupom_codigo, forma_pagamento, asaas_payment_id, invoice_url, pago_em, expiracao_reserva_em, observacoes, created_at, itens:pedido_itens_clinica(id, nome_produto, sku, quantidade, valor_unitario, total)").eq("clinica_id", activeClinic.id).order("created_at", { ascending: false }).limit(120),
    supabase.from("carrinhos_abandonados_clinica").select("id, token_recuperacao, status, nome, telefone, email, subtotal, itens, ultima_interacao_em, lembrete_enviado_em, quantidade_lembretes, consentimento_recuperacao").eq("clinica_id", activeClinic.id).in("status", ["ativo", "recuperado"]).order("ultima_interacao_em", { ascending: false }).limit(40),
    supabase.from("cupons_clinica").select("id, codigo, descricao, tipo, valor, pedido_minimo, desconto_maximo, limite_usos, usos, inicia_em, termina_em, ativo").eq("clinica_id", activeClinic.id).order("created_at", { ascending: false }),
  ]);
  for (const result of [ordersResult, cartsResult, couponsResult]) if (result.error) throw result.error;
  const orders = ordersResult.data || [];
  const carts = cartsResult.data || [];
  const coupons = couponsResult.data || [];
  const paid = orders.filter((order) => order.pagamento_status === "pago" && new Date(order.pago_em || order.created_at) >= since);
  const revenue = paid.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const pending = orders.filter((order) => ["aguardando_pagamento", "confirmado", "em_separacao", "pronto_retirada", "enviado"].includes(order.status)).length;
  const abandoned = carts.filter((cart) => cart.status === "ativo" && cart.consentimento_recuperacao).length;
  const conversionBase = carts.length + orders.length;
  const conversion = conversionBase ? (orders.length / conversionBase) * 100 : 0;
  const productTotals = new Map();
  for (const order of paid) for (const item of order.itens || []) productTotals.set(item.nome_produto, (productTotals.get(item.nome_produto) || 0) + Number(item.quantidade || 0));
  const topProducts = Array.from(productTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const statusFilter = String(query?.status || "");
  const visibleOrders = statusFilter ? orders.filter((order) => order.status === statusFilter) : orders;

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10"><section className="mx-auto max-w-7xl">
      <PageHeader eyebrow="E-commerce" title="Pedidos da Lojinha" description="Acompanhe pagamentos, separação, retirada, entrega, conversão e recuperação de carrinhos." />
      {query?.erro ? <div className="mt-6"><Notice type="danger">{query.mensagem || "Não foi possível concluir a ação."}</Notice></div> : null}
      {query?.ok ? <div className="mt-6"><Notice type="success">{query.mensagem || "Ação concluída."}</Notice></div> : null}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
        [CreditCard, "Receita paga em 30 dias", money(revenue)], [PackageCheck, "Pedidos em operação", pending], [UsersRound, "Carrinhos recuperáveis", abandoned], [Percent, "Conversão observada", `${conversion.toFixed(1)}%`],
      ].map(([Icon, label, value]) => <article key={label} className="premium-panel dashboard-card rounded-xl p-5"><Icon size={21} className="text-[var(--clinic-primary)]" /><strong className="mt-4 block text-2xl">{value}</strong><p className="mt-1 text-sm text-neutral-500">{label}</p></article>)}</div>

      <div className="mt-7 flex flex-wrap gap-2"><a href="/dashboard/pedidos" className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-bold text-neutral-600">Todos</a>{Object.entries(labels).map(([status, label]) => <a key={status} href={`/dashboard/pedidos?status=${status}`} className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-bold text-neutral-600">{label}</a>)}</div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <section className="premium-panel dashboard-card rounded-xl p-5"><h2 className="text-lg font-black">Pedidos</h2><p className="mt-1 text-sm text-neutral-500">{visibleOrders.length} pedido(s) no filtro atual.</p><div className="mt-5 space-y-4">{visibleOrders.length ? visibleOrders.map((order) => <article key={order.id} className="rounded-xl border border-neutral-200 bg-white/70 p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">{labels[order.status] || order.status}</span><span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black uppercase text-neutral-500">{order.pagamento_status.replaceAll("_", " ")}</span><span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black uppercase text-neutral-500">{order.entrega_tipo}</span></div><h3 className="mt-3 text-lg font-black">Pedido #{order.numero} · {order.nome_cliente}</h3><p className="mt-1 text-xs text-neutral-500">{dateTime(order.created_at)} · {order.telefone_cliente}</p></div><strong className="text-xl text-[var(--clinic-primary)]">{money(order.total)}</strong></div><div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 text-sm text-neutral-600">{(order.itens || []).map((item) => <p key={item.id}>{item.quantidade}× {item.nome_produto} — {money(item.total)}</p>)}</div><div className="mt-4 flex flex-wrap gap-2"><form action={updateStoreOrderStatusAction} className="flex gap-2"><input type="hidden" name="id" value={order.id} /><select name="status" defaultValue={order.status} className="h-9 rounded-lg border border-neutral-200 px-2 text-xs">{Object.entries(labels).filter(([status]) => !["estornado", "aguardando_pagamento"].includes(status)).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select><button className="h-9 rounded-lg bg-[var(--clinic-primary)] px-3 text-xs font-bold text-white">Atualizar</button></form>{order.pagamento_status === "pagar_na_retirada" ? <form action={confirmPickupPaymentAction}><input type="hidden" name="id" value={order.id} /><button className="h-9 rounded-lg border border-emerald-300 px-3 text-xs font-bold text-emerald-700">Confirmar pagamento</button></form> : null}{order.pagamento_status === "pago" && order.asaas_payment_id ? <form action={requestStoreOrderRefundAction}><input type="hidden" name="id" value={order.id} /><button className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-300 px-3 text-xs font-bold text-red-700"><RotateCcw size={13} /> Estornar</button></form> : null}{order.invoice_url ? <a href={order.invoice_url} target="_blank" className="h-9 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-bold text-neutral-600">Abrir cobrança</a> : null}</div></article>) : <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">Nenhum pedido encontrado.</p>}</div></section>

        <div className="space-y-6"><section className="premium-panel dashboard-card rounded-xl p-5"><h2 className="text-lg font-black">Produtos mais vendidos</h2><div className="mt-4 space-y-3">{topProducts.length ? topProducts.map(([name, quantity], index) => <div key={name} className="flex items-center justify-between border-b border-neutral-200 pb-3 text-sm"><span>{index + 1}. {name}</span><strong>{quantity} un.</strong></div>) : <p className="text-sm text-neutral-500">As vendas pagas aparecerão aqui.</p>}</div></section><section className="premium-panel dashboard-card rounded-xl p-5"><h2 className="text-lg font-black">Carrinhos para recuperar</h2><div className="mt-4 space-y-3">{carts.filter((cart) => cart.consentimento_recuperacao && cart.telefone).slice(0, 10).map((cart) => <article key={cart.id} className="rounded-xl border border-neutral-200 p-4"><strong className="text-sm">{cart.nome || "Cliente da lojinha"}</strong><p className="mt-1 text-xs text-neutral-500">{money(cart.subtotal)} · {dateTime(cart.ultima_interacao_em)}</p><form action={openAbandonedCartRecoveryAction} className="mt-3"><input type="hidden" name="id" value={cart.id} /><button className="w-full rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-700">Abrir recuperação no WhatsApp</button></form></article>)}{!carts.some((cart) => cart.consentimento_recuperacao && cart.telefone) ? <p className="text-sm text-neutral-500">Nenhum carrinho com autorização de contato.</p> : null}</div></section></div>
      </div>

      <section className="premium-panel dashboard-card mt-7 rounded-xl p-5"><div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr]"><div><h2 className="flex items-center gap-2 text-lg font-black"><Tag size={19} className="text-[var(--clinic-primary)]" /> Criar cupom</h2><form action={createStoreCouponAction} className="mt-5 grid gap-4"><Field label="Código" name="codigo" required placeholder="PRIMEIRACOMPRA" /><Field label="Descrição" name="descricao" /><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Tipo" name="tipo" defaultValue="percentual"><option value="percentual">Percentual</option><option value="fixo">Valor fixo</option></SelectField><Field label="Valor" name="valor" type="number" required /></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Pedido mínimo" name="pedido_minimo" type="number" defaultValue="0" /><Field label="Desconto máximo" name="desconto_maximo" type="number" /></div><div className="grid gap-4 sm:grid-cols-3"><Field label="Limite de usos" name="limite_usos" type="number" /><Field label="Início" name="inicia_em" type="datetime-local" /><Field label="Fim" name="termina_em" type="datetime-local" /></div><SubmitButton>Criar cupom</SubmitButton></form></div><div><h2 className="text-lg font-black">Cupons cadastrados</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{coupons.map((coupon) => <article key={coupon.id} className="rounded-xl border border-neutral-200 bg-white/70 p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-lg text-[var(--clinic-primary)]">{coupon.codigo}</strong><p className="mt-1 text-xs text-neutral-500">{coupon.tipo === "percentual" ? `${coupon.valor}%` : money(coupon.valor)} · {coupon.usos}{coupon.limite_usos ? `/${coupon.limite_usos}` : ""} usos</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${coupon.ativo ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>{coupon.ativo ? "Ativo" : "Inativo"}</span></div><form action={toggleStoreCouponAction} className="mt-4"><input type="hidden" name="id" value={coupon.id} /><input type="hidden" name="ativo" value={coupon.ativo ? "false" : "true"} /><button className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-bold text-neutral-600">{coupon.ativo ? "Desativar" : "Ativar"}</button></form></article>)}{!coupons.length ? <p className="text-sm text-neutral-500">Nenhum cupom criado.</p> : null}</div></div></div></section>
    </section></main>
  );
}
