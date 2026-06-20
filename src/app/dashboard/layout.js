import { redirect } from "next/navigation";
import { LogOut, Sparkles } from "lucide-react";
import { requireClinic } from "@/lib/auth/session";
import { signOutAction } from "@/app/login/actions";
import { getClinicBillingState } from "@/lib/saas/plans";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { canAccessSection, getCurrentMembership } from "@/lib/auth/permissions";

const navItems = [
  { href: "/dashboard", label: "Visao geral", icon: "dashboard", section: "dashboard" },
  { href: "/dashboard/agenda", label: "Agenda", icon: "agenda", section: "agenda" },
  { href: "/dashboard/clientes", label: "Clientes", icon: "clientes", section: "clientes" },
  { href: "/dashboard/crm", label: "CRM", icon: "crm", section: "crm" },
  { href: "/dashboard/profissionais", label: "Profissionais", icon: "profissionais", section: "profissionais" },
  { href: "/dashboard/procedimentos", label: "Procedimentos", icon: "procedimentos", section: "procedimentos" },
  { href: "/dashboard/usuarios", label: "Usuarios", icon: "usuarios", section: "usuarios" },
  { href: "/dashboard/configuracoes", label: "Configuracoes", icon: "configuracoes", section: "configuracoes" },
  { href: "/dashboard/financeiro", label: "Financeiro", icon: "financeiro", section: "financeiro" },
  { href: "/dashboard/assinatura", label: "Assinatura", icon: "assinatura", section: "assinatura" },
];

function safeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

export default async function DashboardLayout({ children }) {
  const context = await requireClinic();
  const { user, activeClinic } = context;

  if (!activeClinic) {
    redirect("/onboarding");
  }

  const metadata = activeClinic.metadata || {};
  const primaryColor = safeColor(metadata.primary_color, "#047857");
  const accentColor = safeColor(metadata.accent_color, "#10b981");
  const brandName = metadata.brand_name || activeClinic.nome || "Clinica SaaS";
  const logoUrl = metadata.logo_url || "";
  const billingState = getClinicBillingState(activeClinic);
  const membership = getCurrentMembership(context.memberships, activeClinic.id);
  const role = membership?.papel || "recepcao";
  const allowedNavItems = navItems.filter((item) => canAccessSection(role, item.section));

  return (
    <div
      className="min-h-screen text-neutral-950 lg:grid lg:grid-cols-[260px_1fr]"
      style={{
        "--clinic-primary": primaryColor,
        "--clinic-accent": accentColor,
        "--clinic-soft": "color-mix(in srgb, var(--clinic-accent) 10%, white)",
        background: "linear-gradient(135deg, color-mix(in srgb, var(--clinic-accent) 10%, #f7f7f4), #f7f7f4 34%, color-mix(in srgb, var(--clinic-primary) 7%, #f7f7f4))",
      }}
    >
      <aside className="border-b border-neutral-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur lg:min-h-screen lg:border-b-0 lg:border-r lg:px-4">
        <div className="flex items-center justify-between gap-3 lg:block">
          <div className="flex items-center gap-3 lg:block">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`Logo ${brandName}`} className="h-14 max-w-[190px] rounded-lg object-contain object-left lg:h-16 lg:w-full" />
            ) : (
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg text-white" style={{ background: "var(--clinic-primary)" }}>
                <Sparkles size={22} />
              </div>
            )}
            <div className="min-w-0 lg:mt-4">
              <p className="text-sm font-bold uppercase leading-5 tracking-[0.18em]" style={{ color: "var(--clinic-primary)" }}>{brandName}</p>
              <div className="mt-3 h-1.5 w-24 rounded-full" style={{ background: "linear-gradient(90deg, var(--clinic-primary), var(--clinic-accent))" }} />
              <p className="mt-2 truncate text-xs text-neutral-500" title={user?.email}>{user?.email}</p>
            </div>
          </div>
          <form action={signOutAction} className="lg:hidden">
            <input type="hidden" name="next" value="/login-cliente" />
            <button className="rounded-lg border border-neutral-200 p-2 text-neutral-600 transition hover:border-[var(--clinic-primary)] hover:text-[var(--clinic-primary)]" type="submit" title="Sair">
              <LogOut size={18} />
            </button>
          </form>
        </div>

        <SidebarNav items={allowedNavItems} />

        <form action={signOutAction} className="mt-6 hidden lg:block">
          <input type="hidden" name="next" value="/login-cliente" />
          <button className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-neutral-500 transition hover:bg-red-50 hover:text-red-700" type="submit">
            <LogOut size={17} />
            Sair
          </button>
        </form>
      </aside>
      <section className="min-w-0">
        {billingState.level !== "ok" ? (
          <div className={`border-b px-5 py-3 text-sm sm:px-8 lg:px-10 ${billingState.level === "danger" ? "border-red-200 bg-red-50 text-red-800" : billingState.level === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
            <strong>{billingState.title}.</strong> {billingState.message}
          </div>
        ) : null}
        <div className="h-1" style={{ background: "linear-gradient(90deg, var(--clinic-primary), var(--clinic-accent))" }} />
        {children}
      </section>
    </div>
  );
}
