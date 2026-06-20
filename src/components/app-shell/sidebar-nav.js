"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CreditCard, KanbanSquare, LayoutDashboard, ReceiptText, Scissors, Settings, Stethoscope, UserCog, UsersRound } from "lucide-react";

const iconMap = {
  dashboard: LayoutDashboard,
  agenda: CalendarDays,
  clientes: UsersRound,
  crm: KanbanSquare,
  profissionais: Stethoscope,
  procedimentos: Scissors,
  usuarios: UserCog,
  configuracoes: Settings,
  financeiro: CreditCard,
  assinatura: ReceiptText,
};

export function SidebarNav({ items }) {
  const pathname = usePathname();

  return (
    <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
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
                ? "bg-[color-mix(in_srgb,var(--clinic-accent)_16%,white)] text-[var(--clinic-primary)] shadow-sm"
                : "text-neutral-600 hover:bg-[color-mix(in_srgb,var(--clinic-accent)_12%,white)] hover:text-[var(--clinic-primary)]",
            ].join(" ")}
          >
            <Icon size={17} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
