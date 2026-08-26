"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/dashboard/financeiro", "Visão geral"], ["/dashboard/financeiro/receber", "A receber"],
  ["/dashboard/financeiro/pacotes", "Pacotes"],
  ["/dashboard/financeiro/pagar", "A pagar"], ["/dashboard/financeiro/movimentacoes", "Movimentações"],
  ["/dashboard/financeiro/fluxo-caixa", "Fluxo de caixa"], ["/dashboard/financeiro/comissoes", "Comissões"],
  ["/dashboard/financeiro/conciliacao", "Conciliação"], ["/dashboard/financeiro/dre", "DRE"],
  ["/dashboard/financeiro/configuracoes", "Configurações"],
];

export function FinanceNav() {
  const pathname = usePathname();
  return <nav aria-label="Financeiro" className="overflow-x-auto border-b border-neutral-200 bg-white/85 px-5 backdrop-blur sm:px-8 lg:px-10">
    <div className="mx-auto flex min-w-max max-w-7xl gap-1 py-2">
      {items.map(([href,label]) => {
        const active = href === "/dashboard/financeiro" ? pathname === href : pathname.startsWith(href);
        return <Link key={href} href={href} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? "bg-[var(--clinic-primary)] text-white shadow-sm" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"}`}>{label}</Link>;
      })}
    </div>
  </nav>;
}
