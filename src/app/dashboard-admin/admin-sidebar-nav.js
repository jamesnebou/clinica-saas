"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Building2,
  CreditCard,
  LineChart,
  Menu,
  MousePointerClick,
  Settings,
  UserCheck,
  X,
} from "lucide-react";
import { useState } from "react";

export const adminNavItems = [
  { href: "/dashboard-admin", label: "Visão geral", icon: LineChart },
  { href: "/dashboard-admin/metricas", label: "Métricas", icon: BarChart3 },
  { href: "/dashboard-admin/funil", label: "Funil comercial", icon: MousePointerClick },
  { href: "/dashboard-admin/clinicas", label: "Clínicas", icon: Building2 },
  { href: "/dashboard-admin/alertas", label: "Alertas", icon: AlertTriangle },
  { href: "/dashboard-admin/nova-alerta", label: "Nova clínica", icon: UserCheck },
  { href: "/dashboard-admin/planos", label: "Planos", icon: CreditCard },
  { href: "/dashboard-admin/tutoriais", label: "Tutoriais", icon: BookOpenCheck },
  { href: "/dashboard-admin/configuracoes", label: "Configurações", icon: Settings },
];

function isActivePath(pathname, href) {
  if (href === "/dashboard-admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 px-4 py-5">
      {adminNavItems.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "group relative flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-sm font-bold transition",
              active ? "bg-white/[0.09] text-white shadow-[0_18px_45px_rgba(237,112,9,0.18)]" : "text-white/70 hover:bg-white/10 hover:text-white",
            ].join(" ")}
          >
            {active ? (
              <>
                <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[#ed7009] shadow-[0_0_22px_rgba(237,112,9,0.85)]" />
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_12%_50%,rgba(237,112,9,0.25),transparent_13rem)]" />
                <span className="absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-[#ed7009]/70 to-transparent" />
              </>
            ) : null}
            <span className={`relative flex h-8 w-8 items-center justify-center rounded-xl transition ${active ? "bg-[#ed7009] text-white shadow-[0_0_26px_rgba(237,112,9,0.55)]" : "bg-white/[0.06] text-orange-300 group-hover:bg-white/[0.10]"}`}>
              <Icon size={17} />
            </span>
            <span className="relative">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminMobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] text-white shadow-[0_16px_34px_rgba(0,0,0,0.25)]"
        aria-label="Abrir menu administrativo"
      >
        <Menu size={21} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] bg-black/55 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <aside
            className="absolute right-3 top-3 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.75rem] border border-white/12 bg-[#1c1c1c] p-3 text-white shadow-[0_34px_110px_rgba(0,0,0,0.46)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-2 pb-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">Admin</p>
                <p className="mt-1 text-sm font-bold text-white/70">Navegação interna</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.06] text-white"
                aria-label="Fechar menu administrativo"
              >
                <X size={19} />
              </button>
            </div>

            <nav className="max-h-[calc(100vh-7rem)] space-y-1 overflow-y-auto py-3">
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={[
                      "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-black transition",
                      active ? "bg-[#ed7009] text-white shadow-[0_18px_45px_rgba(237,112,9,0.28)]" : "text-white/72 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-white/16" : "bg-white/[0.06] text-orange-300"}`}>
                      <Icon size={17} />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
