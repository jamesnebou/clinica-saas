import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CreditCard, LayoutDashboard, LogOut, Scissors, Sparkles, Stethoscope, UsersRound } from "lucide-react";
import { requireClinic } from "@/lib/auth/session";
import { signOutAction } from "@/app/login/actions";

const navItems = [
  { href: "/dashboard", label: "Visao geral", icon: LayoutDashboard },
  { href: "/dashboard/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/dashboard/clientes", label: "Clientes", icon: UsersRound },
  { href: "/dashboard/profissionais", label: "Profissionais", icon: Stethoscope },
  { href: "/dashboard/procedimentos", label: "Procedimentos", icon: Scissors },
  { href: "/dashboard/financeiro", label: "Financeiro", icon: CreditCard },
];

export default async function DashboardLayout({ children }) {
  const { user, activeClinic } = await requireClinic();

  if (!activeClinic) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-[#f7f7f4] text-neutral-950 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-neutral-200 bg-white px-5 py-4 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-4">
        <div className="flex items-center justify-between gap-3 lg:block">
          <div>
            <div className="flex items-center gap-2 text-emerald-700">
              <Sparkles size={18} />
              <span className="text-xs font-bold uppercase tracking-[0.2em]">Clinica SaaS</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-neutral-950">{activeClinic.nome}</p>
            <p className="mt-1 truncate text-xs text-neutral-500" title={user?.email}>{user?.email}</p>
          </div>
          <form action={signOutAction} className="lg:hidden">
            <button className="rounded-lg border border-neutral-200 p-2 text-neutral-600" type="submit" title="Sair">
              <LogOut size={18} />
            </button>
          </form>
        </div>

        <nav className="mt-5 flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950">
                <Icon size={17} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <form action={signOutAction} className="mt-6 hidden lg:block">
          <button className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-neutral-500 transition hover:bg-red-50 hover:text-red-700" type="submit">
            <LogOut size={17} />
            Sair
          </button>
        </form>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
