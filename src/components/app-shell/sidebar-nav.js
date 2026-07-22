"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpenCheck, CalendarDays, CreditCard, KanbanSquare, LayoutDashboard, Menu, ReceiptText, Scissors, ShoppingBag, PackageCheck, Settings, Stethoscope, UserCog, UsersRound, X } from "lucide-react";
import { useState } from "react";

const iconMap = {
  dashboard: LayoutDashboard,
  agenda: CalendarDays,
  notificacoes: Bell,
  clientes: UsersRound,
  crm: KanbanSquare,
  profissionais: Stethoscope,
  procedimentos: Scissors,
  produtos: ShoppingBag,
  pedidos: PackageCheck,
  usuarios: UserCog,
  configuracoes: Settings,
  financeiro: CreditCard,
  assinatura: ReceiptText,
  tutoriais: BookOpenCheck,
};

export function SidebarNav({ items }) {
  const pathname = usePathname();

  return (
    <nav className="relative mt-5 flex gap-2 overflow-x-auto pb-1 md:min-h-0 md:flex-1 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:pr-1 md:pb-2">
      {items.map((item) => {
        const Icon = iconMap[item.icon] || LayoutDashboard;
        const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
              active
                ? "bg-[linear-gradient(135deg,color-mix(in_srgb,var(--clinic-accent)_20%,white),rgba(255,255,255,0.82))] text-[var(--clinic-primary)] shadow-[0_12px_26px_color-mix(in_srgb,var(--clinic-primary)_14%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--clinic-primary)_16%,transparent)]"
                : "text-neutral-600 hover:bg-white/75 hover:text-[var(--clinic-primary)] hover:shadow-sm",
            ].join(" ")}
          >
            <Icon size={17} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badge ? (
              <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--clinic-primary)] px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileSidebarMenu({ items, brandName, logoUrl }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 px-5 py-3 shadow-sm backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`Logo ${brandName}`} className="h-10 w-10 rounded-lg object-contain" />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-[var(--clinic-primary)]" />
            )}
            <p className="truncate text-sm font-bold uppercase tracking-[0.16em] text-[var(--clinic-primary)]">{brandName}</p>
          </div>
            <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white/70 text-neutral-700 shadow-sm"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 bg-neutral-950/35 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)}>
          <nav className="premium-panel h-full w-[min(340px,86vw)] rounded-none border-y-0 border-l-0 p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 text-center">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={`Logo ${brandName}`} className="mx-auto h-20 max-w-[180px] rounded-xl object-contain" />
                ) : (
                  <div className="mx-auto h-16 w-16 rounded-2xl bg-[var(--clinic-primary)]" />
                )}
                <p className="mt-3 truncate text-sm font-bold uppercase tracking-[0.16em] text-[var(--clinic-primary)]">{brandName}</p>
                <div className="mx-auto mt-3 h-1.5 w-24 rounded-full bg-[linear-gradient(90deg,var(--clinic-primary),var(--clinic-accent))]" />
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-neutral-200 bg-white/70 p-2 text-neutral-700 shadow-sm" aria-label="Fechar menu">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item) => {
                const Icon = iconMap[item.icon] || LayoutDashboard;
                const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={[
                      "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition",
                      active
                        ? "bg-[linear-gradient(135deg,color-mix(in_srgb,var(--clinic-accent)_20%,white),rgba(255,255,255,0.82))] text-[var(--clinic-primary)] shadow-sm"
                        : "text-neutral-600 hover:bg-white/75",
                    ].join(" ")}
                  >
                    <Icon size={18} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--clinic-primary)] px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
