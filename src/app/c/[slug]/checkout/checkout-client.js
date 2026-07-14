"use client";

/* eslint-disable @next/next/no-img-element */

import { ArrowLeft, CreditCard, MapPin, PackageCheck, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPublicStoreOrderAction } from "../store-actions";

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function storageKey(slug) {
  return `clinica_cart_${slug}`;
}

export function StoreCheckout({ slug, brandName, config, onlinePaymentAvailable, cartToken = "", query = {} }) {
  const [items, setItems] = useState([]);
  const [sessionToken, setSessionToken] = useState(cartToken);
  const [deliveryType, setDeliveryType] = useState(config.retiradaAtiva ? "retirada" : "entrega");
  const [form, setForm] = useState({ nome: "", telefone: "", email: "", consentimentoRecuperacao: false });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      let stored = [];
      try { stored = JSON.parse(window.localStorage.getItem(storageKey(slug)) || "[]"); } catch {}
      if (Array.isArray(stored) && stored.length) setItems(stored);

      const token = cartToken || window.localStorage.getItem(`clinica_cart_session_${slug}`) || window.crypto.randomUUID();
      setSessionToken(token);
      window.localStorage.setItem(`clinica_cart_session_${slug}`, token);

      if (!stored.length && token) {
        fetch(`/api/public/store/cart?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`, { cache: "no-store" })
          .then((response) => response.json())
          .then((payload) => { if (payload?.ok && Array.isArray(payload.items)) setItems(payload.items); })
          .catch(() => {});
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cartToken, slug]);

  useEffect(() => {
    if (!sessionToken || !items.length || !form.consentimentoRecuperacao) return;
    const timeout = window.setTimeout(() => {
      fetch("/api/public/store/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          sessionToken,
          items,
          nome: form.nome,
          telefone: form.telefone,
          email: form.email,
          consentimentoRecuperacao: true,
        }),
      }).catch(() => {});
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [form, items, sessionToken, slug]);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + Number(item.preco || 0) * Number(item.quantidade || 0), 0), [items]);
  const freeShipping = deliveryType === "entrega" && Number(config.freteGratisAcima || 0) > 0 && subtotal >= Number(config.freteGratisAcima);
  const freight = deliveryType === "entrega" && !freeShipping ? Number(config.taxaEntrega || 0) : 0;
  const total = subtotal + freight;
  const onlineMethodAvailable = onlinePaymentAvailable && (config.pixAtivo || config.cartaoAtivo);
  const canPay = onlineMethodAvailable || (config.pagamentoRetiradaAtivo && deliveryType === "retirada");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,color-mix(in_srgb,var(--clinic-accent)_18%,transparent),transparent_34rem),linear-gradient(145deg,#fffaf5,#eee7de)] px-5 py-8 text-[#181510] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <a href={`/c/${slug}#loja`} className="inline-flex items-center gap-2 text-sm font-bold text-[var(--clinic-primary)]"><ArrowLeft size={17} /> Voltar à lojinha</a>
        <div className="mt-6 grid gap-7 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[2rem] border border-white/70 bg-white/72 p-6 shadow-[0_28px_80px_rgba(23,19,15,0.12)] backdrop-blur sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--clinic-primary)]">Checkout seguro</p>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Finalize seu pedido</h1>
            <p className="mt-3 text-sm leading-6 text-neutral-600">Compra na lojinha de {brandName}. Preços e estoque serão conferidos novamente antes do pagamento.</p>

            {query?.erro ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{query.mensagem || "Não foi possível concluir o pedido."}</div> : null}

            {!items.length ? (
              <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 px-6 py-12 text-center">
                <ShoppingBag className="mx-auto text-neutral-400" size={38} />
                <p className="mt-4 font-bold">Seu carrinho está vazio.</p>
                <a href={`/c/${slug}#loja`} className="mt-5 inline-flex rounded-full bg-[var(--clinic-primary)] px-5 py-3 text-sm font-bold text-white">Escolher produtos</a>
              </div>
            ) : (
              <form action={createPublicStoreOrderAction} className="mt-8 space-y-7">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="cart_token" value={sessionToken} />
                <input type="hidden" name="items_json" value={JSON.stringify(items.map((item) => ({ produto_id: item.id, quantidade: item.quantidade })))} />

                <fieldset>
                  <legend className="text-sm font-black text-neutral-900">Seus dados</legend>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block"><span className="text-xs font-bold text-neutral-600">Nome completo</span><input name="nome" required value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm outline-none focus:border-[var(--clinic-primary)]" /></label>
                    <label className="block"><span className="text-xs font-bold text-neutral-600">WhatsApp</span><input name="telefone" required value={form.telefone} onChange={(event) => setForm((current) => ({ ...current, telefone: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm outline-none focus:border-[var(--clinic-primary)]" /></label>
                    <label className="block"><span className="text-xs font-bold text-neutral-600">E-mail</span><input name="email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm outline-none focus:border-[var(--clinic-primary)]" /></label>
                    <label className="block"><span className="text-xs font-bold text-neutral-600">CPF</span><input name="cpf" className="mt-2 h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm outline-none focus:border-[var(--clinic-primary)]" /></label>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-sm font-black text-neutral-900">Como deseja receber?</legend>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {config.retiradaAtiva ? <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${deliveryType === "retirada" ? "border-[var(--clinic-primary)] bg-[color-mix(in_srgb,var(--clinic-primary)_7%,white)]" : "border-neutral-200"}`}><input type="radio" name="entrega_tipo" value="retirada" checked={deliveryType === "retirada"} onChange={() => setDeliveryType("retirada")} /><PackageCheck className="text-[var(--clinic-primary)]" size={21} /><span><strong className="block text-sm">Retirar na clínica</strong><small className="mt-1 block text-neutral-500">Sem taxa de entrega</small></span></label> : null}
                    {config.entregaAtiva ? <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${deliveryType === "entrega" ? "border-[var(--clinic-primary)] bg-[color-mix(in_srgb,var(--clinic-primary)_7%,white)]" : "border-neutral-200"}`}><input type="radio" name="entrega_tipo" value="entrega" checked={deliveryType === "entrega"} onChange={() => setDeliveryType("entrega")} /><Truck className="text-[var(--clinic-primary)]" size={21} /><span><strong className="block text-sm">Receber no endereço</strong><small className="mt-1 block text-neutral-500">{config.freteGratisAcima > 0 ? `${money(config.taxaEntrega)} · grátis acima de ${money(config.freteGratisAcima)}` : `Taxa de ${money(config.taxaEntrega)}`}</small></span></label> : null}
                  </div>
                </fieldset>

                {deliveryType === "entrega" ? (
                  <fieldset className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-5">
                    <legend className="px-2 text-sm font-black text-neutral-900">Endereço de entrega</legend>
                    {(config.entregaCidade || config.bairrosEntrega?.length) ? <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">Área atendida: {config.entregaCidade || "cidade informada"}{config.bairrosEntrega?.length ? ` · bairros: ${config.bairrosEntrega.join(", ")}` : ""}.</p> : null}
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[['CEP','cep'],['Endereço','endereco'],['Número','numero_endereco'],['Complemento','complemento'],['Bairro','bairro'],['Cidade','cidade'],['UF','estado'],['Referência','referencia_entrega']].map(([label, name]) => <label key={name} className={name === 'endereco' || name === 'referencia_entrega' ? 'block sm:col-span-2' : 'block'}><span className="text-xs font-bold text-neutral-600">{label}</span><input name={name} required={!['complemento','referencia_entrega'].includes(name)} defaultValue={name === 'cidade' ? config.entregaCidade : undefined} maxLength={name === 'estado' ? 2 : undefined} className="mt-2 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[var(--clinic-primary)]" /></label>)}
                    </div>
                  </fieldset>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="text-xs font-bold text-neutral-600">Cupom</span><input name="cupom_codigo" placeholder="Digite o código" className="mt-2 h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm uppercase outline-none focus:border-[var(--clinic-primary)]" /></label>
                  <label className="block"><span className="text-xs font-bold text-neutral-600">Pagamento</span><select name="forma_pagamento" className="mt-2 h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm outline-none focus:border-[var(--clinic-primary)]">{onlinePaymentAvailable && config.pixAtivo ? <option value="PIX">Pix no Asaas</option> : null}{onlinePaymentAvailable && config.cartaoAtivo ? <option value="CREDIT_CARD">Cartão de crédito no Asaas</option> : null}{config.pagamentoRetiradaAtivo && deliveryType === "retirada" ? <option value="PAGAR_NA_RETIRADA">Pagar na retirada</option> : null}</select></label>
                </div>

                <label className="flex items-start gap-3 text-sm leading-6 text-neutral-600"><input type="checkbox" name="consentimento_lgpd" required className="mt-1" /><span>Concordo com o uso dos meus dados para processar o pedido, pagamento, entrega e atendimento, conforme a política de privacidade.</span></label>
                <label className="flex items-start gap-3 text-sm leading-6 text-neutral-600"><input type="checkbox" checked={form.consentimentoRecuperacao} onChange={(event) => setForm((current) => ({ ...current, consentimentoRecuperacao: event.target.checked }))} className="mt-1" /><span>Aceito receber um lembrete sobre este carrinho caso eu não conclua a compra.</span></label>

                {!canPay ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Nenhuma forma de pagamento está disponível. Fale com a clínica.</div> : null}
                <button type="submit" disabled={!canPay} className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--clinic-primary)] px-6 py-4 text-sm font-black text-white shadow-[0_18px_46px_color-mix(in_srgb,var(--clinic-primary)_24%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"><CreditCard size={19} /> Finalizar pedido</button>
                <p className="flex items-center justify-center gap-2 text-center text-xs text-neutral-500"><ShieldCheck size={15} /> O valor e o estoque são validados no servidor. Dados de cartão não passam pelo nosso sistema.</p>
              </form>
            )}
          </section>

          <aside className="h-fit rounded-[2rem] bg-[#17130f] p-6 text-white shadow-[0_32px_90px_rgba(23,19,15,0.24)] lg:sticky lg:top-6 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--clinic-accent)]">Resumo</p>
            <div className="mt-5 space-y-4">{items.map((item) => <div key={item.id} className="flex items-center gap-3 border-b border-white/10 pb-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10">{item.imagem_url ? <img src={item.imagem_url} alt="" className="h-full w-full object-cover" /> : <ShoppingBag size={19} />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.nome}</p><p className="mt-1 text-xs text-white/50">{item.quantidade} × {money(item.preco)}</p></div><strong className="text-sm">{money(item.quantidade * item.preco)}</strong></div>)}</div>
            <div className="mt-6 space-y-3 text-sm"><div className="flex justify-between text-white/60"><span>Subtotal</span><span>{money(subtotal)}</span></div><div className="flex justify-between text-white/60"><span>Entrega</span><span>{freight ? money(freight) : "Grátis"}</span></div><div className="flex justify-between border-t border-white/15 pt-4 text-lg"><strong>Total estimado</strong><strong className="text-[var(--clinic-accent)]">{money(total)}</strong></div></div>
            <div className="mt-7 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-5 text-white/55"><p className="flex gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-[var(--clinic-accent)]" />{deliveryType === "retirada" ? config.mensagemRetirada : `${config.prazoEntrega} ${config.mensagemEntrega}`}</p><p className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--clinic-accent)]" />Pagamento online processado em ambiente seguro.</p></div>
          </aside>
        </div>
      </div>
    </main>
  );
}
