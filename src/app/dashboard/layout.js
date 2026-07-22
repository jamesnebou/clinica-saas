import { redirect } from "next/navigation";
import { LogOut, Sparkles } from "lucide-react";
import { requireClinic } from "@/lib/auth/session";
import { signOutAction } from "@/app/login/actions";
import { getClinicBillingState } from "@/lib/saas/plans";
import { MobileSidebarMenu, SidebarNav } from "@/components/app-shell/sidebar-nav";
import { canAccessSection, getCurrentMembership } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";


export async function generateMetadata() {
  try {
    const { activeClinic } = await requireClinic();
    const metadata = activeClinic?.metadata || {};
    const site = metadata.site_publico || {};
    const brandName = metadata.brand_name || activeClinic?.nome || "Cl\u00ednica SaaS";
    const faviconUrl = site.favicon_url || metadata.logo_url || "";

    return {
      title: `${brandName} | Dashboard`,
      icons: faviconUrl ? {
        icon: [{ url: faviconUrl }],
        shortcut: [{ url: faviconUrl }],
        apple: [{ url: faviconUrl }],
      } : undefined,
    };
  } catch {
    return { title: "Dashboard | Cl\u00ednica SaaS" };
  }
}

const navItems = [
  { href: "/dashboard", label: "Visão geral", icon: "dashboard", section: "dashboard" },
  { href: "/dashboard/agenda", label: "Agenda", icon: "agenda", section: "agenda" },
  { href: "/dashboard/notificacoes", label: "Notificações", icon: "notificacoes", section: "notificacoes" },
  { href: "/dashboard/clientes", label: "Clientes", icon: "clientes", section: "clientes" },
  { href: "/dashboard/crm", label: "CRM", icon: "crm", section: "crm" },
  { href: "/dashboard/profissionais", label: "Profissionais", icon: "profissionais", section: "profissionais" },
  { href: "/dashboard/procedimentos", label: "Procedimentos", icon: "procedimentos", section: "procedimentos" },
  { href: "/dashboard/produtos", label: "Lojinha", icon: "produtos", section: "produtos" },
  { href: "/dashboard/pedidos", label: "Pedidos", icon: "pedidos", section: "pedidos" },
  { href: "/dashboard/usuarios", label: "Usuários", icon: "usuarios", section: "usuarios" },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: "configuracoes", section: "configuracoes" },
  { href: "/dashboard/financeiro", label: "Financeiro", icon: "financeiro", section: "financeiro" },
  { href: "/dashboard/assinatura", label: "Assinatura", icon: "assinatura", section: "assinatura" },
  { href: "/dashboard/tutoriais", label: "Tutoriais", icon: "tutoriais", section: "tutoriais" },
];

function safeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${value}`.includes("T") ? value : `${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function isOpenChargeStatus(status) {
  return ["pending", "pendente", "overdue", "vencido"].includes(String(status || "").toLowerCase());
}

async function getOpenCharge(activeClinic) {
  if (["cancelada", "inativa"].includes(String(activeClinic?.status || "").toLowerCase())) return null;
  if (["cancelada", "isenta"].includes(String(activeClinic?.assinatura_status || "").toLowerCase())) return null;

  const { data, error } = await supabaseAdmin
    .from("asaas_cobrancas")
    .select("id, status, valor, vencimento, invoice_url")
    .eq("clinica_id", activeClinic.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Erro ao carregar cobranca pendente:", error);
    return null;
  }

  return isOpenChargeStatus(data?.status) ? data : null;
}

async function getNotificationBadgeCount(activeClinic) {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const query = supabaseAdmin
    .from("site_agendamentos_publicos")
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", activeClinic.id)
    .in("pagamento_status", ["pendente", "erro"])
    .gte("created_at", since.toISOString());

  const { count, error } = await query.is("visualizado_em", null);

  if (error) {
    const { count: fallbackCount } = await supabaseAdmin
      .from("site_agendamentos_publicos")
      .select("id", { count: "exact", head: true })
      .eq("clinica_id", activeClinic.id)
      .in("pagamento_status", ["pendente", "erro"])
      .gte("created_at", since.toISOString());

    return fallbackCount || 0;
  }

  return count || 0;
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
  const brandName = metadata.brand_name || activeClinic.nome || "Cl\u00ednica SaaS";
  const logoUrl = metadata.logo_url || "";
  const billingState = getClinicBillingState(activeClinic);
  const membership = getCurrentMembership(context.memberships, activeClinic.id);
  const role = membership?.papel || "recepcao";
  const [openCharge, notificationCount] = await Promise.all([
    getOpenCharge(activeClinic),
    getNotificationBadgeCount(activeClinic),
  ]);
  const allowedNavItems = navItems
    .filter((item) => canAccessSection(role, item.section, membership))
    .map((item) => item.section === "notificacoes" && notificationCount > 0 ? { ...item, badge: notificationCount } : item);

  return (
    <div
      className="premium-shell min-h-screen text-neutral-950 md:pl-[260px]"
      style={{
        "--clinic-primary": primaryColor,
        "--clinic-accent": accentColor,
        "--clinic-soft": "color-mix(in srgb, var(--clinic-accent) 10%, white)",
        background: "radial-gradient(circle at 10% 0%, color-mix(in srgb, var(--clinic-accent) 16%, transparent), transparent 30rem), radial-gradient(circle at 100% 10%, color-mix(in srgb, var(--clinic-primary) 13%, transparent), transparent 28rem), radial-gradient(circle at 82% 80%, rgba(18,18,16,0.055), transparent 30rem), linear-gradient(145deg, #f9f8f4 0%, #f1eee7 48%, #ebefeb 100%)",
      }}
    >
      <MobileSidebarMenu items={allowedNavItems} brandName={brandName} logoUrl={logoUrl} />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-neutral-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur-xl md:flex">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[linear-gradient(180deg,transparent,var(--clinic-accent),transparent)] opacity-55" />
        <div className="pointer-events-none absolute left-0 top-0 h-48 w-full bg-[radial-gradient(circle_at_18%_0%,color-mix(in_srgb,var(--clinic-accent)_15%,transparent),transparent_70%)]" />
        <div className="flex items-center justify-between gap-3 md:block">
          <div className="flex items-center gap-3 md:flex md:flex-col md:text-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`Logo ${brandName}`} className="relative h-14 max-w-[190px] rounded-xl object-contain object-center md:h-24 md:w-full md:max-w-[210px]" />
            ) : (
              <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-lg text-white shadow-[0_16px_34px_color-mix(in_srgb,var(--clinic-primary)_30%,transparent)] md:h-20 md:w-20 md:rounded-2xl" style={{ background: "linear-gradient(135deg, var(--clinic-primary), color-mix(in srgb, var(--clinic-primary) 70%, #111))" }}>
                <Sparkles className="md:h-9 md:w-9" size={22} />
              </div>
            )}
            <div className="min-w-0 md:mt-2 md:w-full">
              <p className="text-sm font-bold uppercase leading-5 tracking-[0.18em]" style={{ color: "var(--clinic-primary)" }}>{brandName}</p>
              <p className="mt-2 truncate text-xs text-neutral-500" title={user?.email}>{user?.email}</p>
              <div className="mt-3 h-1.5 w-24 rounded-full md:mx-auto md:w-28" style={{ background: "linear-gradient(90deg, var(--clinic-primary), var(--clinic-accent))" }} />
            </div>
          </div>
          <form action={signOutAction} className="md:hidden">
            <input type="hidden" name="next" value="/login-cliente" />
            <button className="rounded-lg border border-neutral-200 p-2 text-neutral-600 transition hover:border-[var(--clinic-primary)] hover:text-[var(--clinic-primary)]" type="submit" title="Sair">
              <LogOut size={18} />
            </button>
          </form>
        </div>

        <SidebarNav items={allowedNavItems} />

        <form action={signOutAction} className="mt-3 hidden shrink-0 border-t border-neutral-200 pt-3 md:block">
          <input type="hidden" name="next" value="/login-cliente" />
          <button className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-neutral-500 transition hover:bg-red-50 hover:text-red-700" type="submit">
            <LogOut size={17} />
            Sair
          </button>
        </form>
      </aside>
      <section className="min-w-0">
        {billingState.level !== "ok" ? (
          <div className={`border-b px-5 py-3 text-sm shadow-sm backdrop-blur sm:px-8 lg:px-10 ${billingState.level === "danger" ? "border-red-200 bg-red-50/90 text-red-800" : billingState.level === "warning" ? "border-amber-200 bg-amber-50/90 text-amber-900" : "border-sky-200 bg-sky-50/90 text-sky-900"}`}>
            <strong>{billingState.title}.</strong> {billingState.message}
          </div>
        ) : null}
        {openCharge ? (
          <div className="border-b border-amber-200 bg-amber-50/90 px-5 py-3 text-sm text-amber-900 shadow-sm backdrop-blur sm:px-8 lg:px-10">
            <strong>Pagamento pendente.</strong> Existe uma cobranca com vencimento em {formatDate(openCharge.vencimento)}. Se nao for regularizada, o sistema pode ser bloqueado automaticamente.
            {openCharge.invoice_url ? <a href={openCharge.invoice_url} target="_blank" className="ml-2 font-bold underline">Abrir fatura</a> : null}
          </div>
        ) : null}
        <div className="h-1" style={{ background: "linear-gradient(90deg, var(--clinic-primary), var(--clinic-accent))" }} />
        {children}
      </section>
    </div>
  );
}
