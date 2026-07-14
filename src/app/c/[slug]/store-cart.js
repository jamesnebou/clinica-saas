"use client";

/* eslint-disable @next/next/no-img-element */

import { Minus, Plus, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function storageKey(slug) {
  return `clinica_cart_${slug}`;
}

function getSessionToken(slug) {
  const key = `clinica_cart_session_${slug}`;
  const saved = window.localStorage.getItem(key);
  if (saved) return saved;
  const value = window.crypto.randomUUID();
  window.localStorage.setItem(key, value);
  return value;
}

function StoreProductCard({ product, onAdd, moving = false, index = 0 }) {
  const available = Number(product.estoque_disponivel || 0);
  const cardClassName = [
    moving ? "store-showcase-card shrink-0" : "public-card-reveal public-reveal-up h-full",
    "public-hover-card flex flex-col overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white/70 shadow-[0_18px_44px_rgba(23,19,15,0.07)] backdrop-blur",
  ].join(" ");

  return (
    <article className={cardClassName} data-store-index={index} style={moving ? { width: "17.5rem" } : undefined}>
      {product.imagem_url ? (
        <img src={product.imagem_url} alt={product.nome} className="aspect-[4/3] w-full object-cover" />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle,color-mix(in_srgb,var(--clinic-accent)_28%,transparent),transparent_68%)]"><ShoppingBag size={42} className="text-[var(--clinic-primary)]" /></div>
      )}
      <div className="flex h-[310px] flex-col p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--clinic-primary)]">{product.categoria || "Cuidados"}</p>
        <h3 className="mt-3 h-14 overflow-hidden text-lg font-semibold text-[#181510]" style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}>{product.nome}</h3>
        <p className="mt-3 h-12 overflow-hidden text-sm leading-6 text-neutral-600" style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}>{product.descricao || "Cuidado selecionado pela clínica para complementar sua rotina."}</p>
        <div className="mt-auto border-t border-neutral-200 pt-4">
          <div className="flex items-end justify-between gap-3">
            <div><strong className="text-xl text-[var(--clinic-primary)]">{money(product.preco)}</strong><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">{available} em estoque</p></div>
            <button type="button" onClick={() => onAdd(product)} disabled={!available} aria-label={"Adicionar " + product.nome + " ao carrinho"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--clinic-primary)] text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"><Plus size={18} /></button>
          </div>
          <button type="button" onClick={() => onAdd(product)} disabled={!available} className="mt-4 w-full rounded-full border border-[var(--clinic-primary)] px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-[var(--clinic-primary)] transition hover:bg-[var(--clinic-primary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40">{available ? "Adicionar ao carrinho" : "Esgotado"}</button>
        </div>
      </div>
    </article>
  );
}

export function PublicStorefront({ slug, products, recoveryToken = "", mode = "showcase" }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sessionToken, setSessionToken] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("todas");
  const recoveryAttempted = useRef(false);

  const showcaseViewportRef = useRef(null);
  const showcaseTrackRef = useRef(null);
  const showcaseAnimationRef = useRef(null);
  const showcaseHoverRef = useRef(false);
  const showcaseDraggedRef = useRef(false);
  const showcasePointerRef = useRef({ active: false, captured: false, startX: 0, startScrollLeft: 0 });
  const showcaseProducts = useMemo(() => products.slice(0, 12), [products]);
  const showcaseRepeatCount = 5;
  const showcaseLoop = useMemo(
    () => Array.from({ length: showcaseRepeatCount }).flatMap(() => showcaseProducts),
    [showcaseProducts]
  );
  const categories = useMemo(() => Array.from(new Set(products.map((product) => String(product.categoria || "Cuidados").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [products]);
  const filteredProducts = useMemo(() => {
    const query = normalizeSearch(searchTerm);
    return products.filter((product) => {
      const productCategory = String(product.categoria || "Cuidados").trim();
      const matchesCategory = selectedCategory === "todas" || productCategory === selectedCategory;
      const searchable = normalizeSearch([product.nome, product.categoria, product.descricao].filter(Boolean).join(" "));
      return matchesCategory && (!query || searchable.includes(query));
    });
  }, [products, searchTerm, selectedCategory]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const token = getSessionToken(slug);
      setSessionToken(token);
      try {
        const stored = JSON.parse(window.localStorage.getItem(storageKey(slug)) || "[]");
        setItems(Array.isArray(stored) ? stored : []);
      } catch {
        setItems([]);
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [slug]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!hydrated || !recoveryToken || recoveryAttempted.current) return;
    recoveryAttempted.current = true;
    fetch(`/api/public/store/cart?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(recoveryToken)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload?.ok || !Array.isArray(payload.items)) return;
        setItems(payload.items);
        if (payload.sessionToken) {
          setSessionToken(payload.sessionToken);
          window.localStorage.setItem(`clinica_cart_session_${slug}`, payload.sessionToken);
        }
        setOpen(true);
      })
      .catch(() => {});
  }, [hydrated, recoveryToken, slug]);

  useEffect(() => {
    if (!hydrated || !sessionToken) return;
    const normalized = items.map((item) => {
      const product = productsById.get(item.id);
      const available = Number(product?.estoque_disponivel || item.estoque_disponivel || 0);
      return product ? { ...item, ...product, quantidade: Math.min(Number(item.quantidade || 1), available) } : null;
    }).filter((item) => item && item.quantidade > 0);
    window.localStorage.setItem(storageKey(slug), JSON.stringify(normalized));
    const timeout = window.setTimeout(() => {
      fetch("/api/public/store/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, sessionToken, items: normalized }),
      }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [hydrated, items, productsById, sessionToken, slug]);


  useEffect(() => {
    if (mode === "full" || showcaseProducts.length === 0) return undefined;
    const viewport = showcaseViewportRef.current;
    const track = showcaseTrackRef.current;
    if (!viewport || !track) return undefined;

    const segmentWidth = () => track.scrollWidth / showcaseRepeatCount;
    const setInitialPosition = () => {
      const segment = segmentWidth();
      if (segment) viewport.scrollLeft = segment * 2;
    };
    const normalizePosition = () => {
      const segment = segmentWidth();
      if (!segment) return;
      if (viewport.scrollLeft < segment) viewport.scrollLeft += segment * 2;
      if (viewport.scrollLeft > segment * 3) viewport.scrollLeft -= segment * 2;
    };

    const initialFrame = window.requestAnimationFrame(setInitialPosition);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lastTime = performance.now();

    const animate = (time) => {
      const delta = Math.min(64, time - lastTime);
      lastTime = time;
      if (!reducedMotion && !showcasePointerRef.current.active && !showcaseHoverRef.current) {
        viewport.scrollLeft += (46 * delta) / 1000;
        normalizePosition();
      }
      showcaseAnimationRef.current = window.requestAnimationFrame(animate);
    };

    showcaseAnimationRef.current = window.requestAnimationFrame(animate);
    window.addEventListener("resize", setInitialPosition);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      if (showcaseAnimationRef.current) window.cancelAnimationFrame(showcaseAnimationRef.current);
      window.removeEventListener("resize", setInitialPosition);
    };
  }, [mode, showcaseProducts]);

  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantidade || 0), 0);
  const subtotal = items.reduce((sum, item) => sum + Number(item.preco || 0) * Number(item.quantidade || 0), 0);

  function add(product) {
    setItems((current) => {
      const existing = current.find((item) => item.id === product.id);
      const quantity = Math.min(Number(product.estoque_disponivel || 0), Number(existing?.quantidade || 0) + 1);
      if (!quantity) return current;
      return existing
        ? current.map((item) => item.id === product.id ? { ...product, quantidade: quantity } : item)
        : [...current, { ...product, quantidade: 1 }];
    });
    setOpen(true);
  }

  function changeQuantity(id, delta) {
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item;
      const quantity = Math.max(0, Math.min(Number(item.estoque_disponivel || 0), Number(item.quantidade || 0) + delta));
      return { ...item, quantidade: quantity };
    }).filter((item) => item.quantidade > 0));
  }

  function remove(id) {
    setItems((current) => current.filter((item) => item.id !== id));
  }


  function handleShowcasePointerDown(event) {
    if (mode === "full") return;
    const viewport = showcaseViewportRef.current;
    if (!viewport) return;
    showcasePointerRef.current = { active: true, captured: false, startX: event.clientX, startScrollLeft: viewport.scrollLeft };
    showcaseDraggedRef.current = false;
  }

  function handleShowcasePointerMove(event) {
    const viewport = showcaseViewportRef.current;
    const pointer = showcasePointerRef.current;
    if (!viewport || !pointer.active) return;
    const distance = event.clientX - pointer.startX;
    if (Math.abs(distance) <= 6 && !showcaseDraggedRef.current) return;
    showcaseDraggedRef.current = true;
    if (!pointer.captured) {
      viewport.setPointerCapture?.(event.pointerId);
      showcasePointerRef.current.captured = true;
    }
    viewport.scrollLeft = pointer.startScrollLeft - distance;
  }

  function handleShowcasePointerUp(event) {
    const viewport = showcaseViewportRef.current;
    const wasCaptured = showcasePointerRef.current.captured;
    showcasePointerRef.current.active = false;
    showcasePointerRef.current.captured = false;
    if (wasCaptured) viewport?.releasePointerCapture?.(event.pointerId);
    window.setTimeout(() => { showcaseDraggedRef.current = false; }, 120);
  }

  function addFromShowcase(product) {
    if (showcaseDraggedRef.current) return;
    add(product);
  }

  const cartLayer = hydrated ? createPortal(
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-20 top-4 z-[2147482900] flex h-12 min-w-12 items-center justify-center gap-3 rounded-full border border-white/15 bg-[#111]/95 px-0 text-sm font-black text-white shadow-[0_18px_55px_rgba(0,0,0,0.38)] backdrop-blur-xl transition hover:-translate-y-0.5 sm:right-24 sm:h-14 sm:px-5 lg:right-8"
        aria-label={`Abrir carrinho com ${totalQuantity} itens`}
      >
        <ShoppingBag size={20} />
        <span className="hidden sm:inline">Carrinho</span>
        <span className="absolute -bottom-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--clinic-accent)] px-1.5 text-xs text-[#101010] sm:static">{totalQuantity}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[2147483100]" role="dialog" aria-modal="true" aria-label="Carrinho de compras">
          <button type="button" className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm" aria-label="Fechar carrinho" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col overflow-hidden border-l border-white/10 bg-[#0d0d0d] text-white shadow-[-34px_0_100px_rgba(0,0,0,0.55)]">
            <div className="shrink-0 border-b border-white/10 bg-[radial-gradient(circle_at_0%_0%,color-mix(in_srgb,var(--clinic-primary)_24%,transparent),transparent_20rem)] px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--clinic-accent)]">Sua seleção</p>
                  <h2 className="mt-2 text-2xl font-black">Carrinho</h2>
                  <p className="mt-1 text-xs text-white/50">{totalQuantity} {totalQuantity === 1 ? "item" : "itens"} selecionados</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/10" aria-label="Fechar"><X size={20} /></button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5 sm:px-7">
              {items.length ? items.map((item) => (
                <article key={item.id} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.055] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white/8">
                    {item.imagem_url ? <img src={item.imagem_url} alt="" className="h-full w-full object-cover" /> : <ShoppingBag className="m-6 text-white/30" size={28} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold text-white">{item.nome}</h3>
                    <p className="mt-1 text-sm font-black text-[var(--clinic-accent)]">{money(item.preco)}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-full border border-white/12 bg-black/30">
                        <button type="button" onClick={() => changeQuantity(item.id, -1)} className="p-2 text-white/75 transition hover:text-white" aria-label="Diminuir quantidade"><Minus size={14} /></button>
                        <span className="w-7 text-center text-xs font-black text-white">{item.quantidade}</span>
                        <button type="button" onClick={() => changeQuantity(item.id, 1)} disabled={item.quantidade >= item.estoque_disponivel} className="p-2 text-white/75 transition hover:text-white disabled:opacity-25" aria-label="Aumentar quantidade"><Plus size={14} /></button>
                      </div>
                      <button type="button" onClick={() => remove(item.id)} className="rounded-full p-2 text-red-400 transition hover:bg-red-500/10 hover:text-red-300" aria-label={`Remover ${item.nome}`}><Trash2 size={17} /></button>
                    </div>
                  </div>
                </article>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.025] px-5 py-14 text-center">
                  <ShoppingBag className="mx-auto text-white/25" size={38} />
                  <p className="mt-4 text-sm font-bold text-white/70">Seu carrinho está vazio.</p>
                  <button type="button" onClick={() => setOpen(false)} className="mt-4 text-sm font-black text-[var(--clinic-accent)]">Escolher produtos</button>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-white/10 bg-[#111] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-7 sm:pt-6">
              <div className="flex items-center justify-between text-sm text-white/55"><span>Subtotal</span><strong className="text-2xl font-black text-white">{money(subtotal)}</strong></div>
              <p className="mt-2 text-xs leading-5 text-white/40">Frete e descontos são calculados no checkout.</p>
              {items.length ? <a href={`/c/${slug}/checkout?cart=${encodeURIComponent(sessionToken)}`} className="mt-5 flex w-full items-center justify-center rounded-full bg-[var(--clinic-primary)] px-6 py-4 text-sm font-black text-white shadow-[0_18px_50px_color-mix(in_srgb,var(--clinic-primary)_35%,transparent)] transition hover:brightness-110">Ir para o checkout</a> : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>,
    document.body,
  ) : null;

  return (
    <>
      <section id="loja" className={mode === "full" ? "mx-auto min-h-[calc(100vh-5rem)] max-w-7xl px-5 py-16 sm:px-8 sm:py-20" : "public-section-warm mx-auto max-w-7xl px-5 py-24 sm:px-8"}>
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--clinic-primary)]">Lojinha</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-[#181510] sm:text-5xl">{mode === "full" ? "Loja completa" : "Cuidados para levar com você"}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-neutral-600">{mode === "full" ? "Encontre todos os produtos disponíveis e escolha seus cuidados com tranquilidade." : "Escolha seus produtos, compre com segurança e retire na clínica ou receba conforme a disponibilidade."}</p>
        </div>

        {products.length ? mode === "full" ? (
          <>
            <div className="mx-auto mt-9 grid max-w-5xl gap-3 rounded-[1.5rem] border border-white/60 bg-white/55 p-3 shadow-[0_18px_55px_rgba(23,19,15,0.08)] backdrop-blur-xl md:grid-cols-[1fr_240px]">
              <label className="relative block">
                <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar produto, categoria ou descrição"
                  className="h-12 w-full rounded-xl border border-neutral-200 bg-white/85 pl-11 pr-4 text-sm text-neutral-900 outline-none transition focus:border-[var(--clinic-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--clinic-primary)_18%,transparent)]"
                />
              </label>
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                aria-label="Filtrar por categoria"
                className="h-12 w-full rounded-xl border border-neutral-200 bg-white/85 px-4 text-sm font-semibold text-neutral-800 outline-none transition focus:border-[var(--clinic-primary)]"
              >
                <option value="todas">Todas as categorias</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
              <p><strong className="text-neutral-900">{filteredProducts.length}</strong> {filteredProducts.length === 1 ? "produto encontrado" : "produtos encontrados"}</p>
              {searchTerm || selectedCategory !== "todas" ? <button type="button" onClick={() => { setSearchTerm(""); setSelectedCategory("todas"); }} className="font-black text-[var(--clinic-primary)]">Limpar filtros</button> : null}
            </div>
            {filteredProducts.length ? (
              <div className="mt-6 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProducts.map((product, index) => <StoreProductCard key={product.id} product={product} index={index} onAdd={add} />)}
              </div>
            ) : (
              <div className="mt-6 rounded-[1.75rem] border border-dashed border-neutral-300 bg-white/45 px-6 py-16 text-center">
                <Search className="mx-auto text-neutral-300" size={38} />
                <p className="mt-4 text-sm font-bold text-neutral-700">Nenhum produto corresponde aos filtros.</p>
                <button type="button" onClick={() => { setSearchTerm(""); setSelectedCategory("todas"); }} className="mt-4 text-sm font-black text-[var(--clinic-primary)]">Mostrar todos os produtos</button>
              </div>
            )}
          </>
        ) : (
          <>
            <div
              ref={showcaseViewportRef}
              className="public-store-viewport relative mt-10 overflow-x-auto py-6"
              onPointerDown={handleShowcasePointerDown}
              onPointerMove={handleShowcasePointerMove}
              onPointerUp={handleShowcasePointerUp}
              onPointerCancel={handleShowcasePointerUp}
              onMouseEnter={() => { showcaseHoverRef.current = true; }}
              onMouseLeave={(event) => {
                showcaseHoverRef.current = false;
                if (showcasePointerRef.current.active) handleShowcasePointerUp(event);
              }}
            >
              <div ref={showcaseTrackRef} className="public-store-track flex w-max items-stretch gap-5">
                {showcaseLoop.map((product, index) => <StoreProductCard key={product.id + "-" + index} product={product} index={index} moving onAdd={addFromShowcase} />)}
              </div>
            </div>
            <div className="mt-7 text-center">
              <a href={"/c/" + slug + "/loja"} className="inline-flex items-center justify-center rounded-full border border-[var(--clinic-primary)] bg-white/55 px-7 py-3 text-sm font-black text-[var(--clinic-primary)] shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:bg-[var(--clinic-primary)] hover:text-white">Ver loja completa</a>
            </div>
          </>
        ) : (
          <div className="mt-10 rounded-[1.75rem] border border-dashed border-neutral-300 bg-white/45 px-6 py-16 text-center text-sm text-neutral-600">Nenhum produto está disponível no momento.</div>
        )}
      </section>
      {cartLayer}
    </>
  );
}
