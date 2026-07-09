import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/login/actions";
import { AdminMobileMenu, AdminSidebarNav } from "@/app/dashboard-admin/admin-sidebar-nav";
import { requireInternalAdmin } from "@/lib/auth/session";

function DashboardAdminSidebar({ user }) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/10 bg-[#1c1c1c] text-white shadow-[24px_0_90px_rgba(28,28,28,0.18)] lg:flex lg:flex-col">
        <div className="border-b border-white/10 p-6">
          <Link href="/dashboard-admin" className="block">
            <Image src="/nexawi-clinicas.png" alt="NexaWi Clínicas" width={190} height={52} priority className="h-12 w-auto object-contain" />
            <p className="mt-2 text-xs font-semibold text-white/56">Admin Clínicas</p>
          </Link>
        </div>

        <AdminSidebarNav />

        <div className="border-t border-white/10 p-4">
          <div className="rounded-2xl bg-white/[0.07] p-4">
            <p className="text-xs font-semibold text-white/48">Administrador logado</p>
            <p className="mt-1 truncate text-sm font-bold text-white">{user.email}</p>
          </div>
          <form action={signOutAction} className="mt-3">
            <input type="hidden" name="next" value="/login" />
            <button
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 text-sm font-bold text-neutral-200 transition hover:bg-white/10"
              type="submit"
            >
              <LogOut size={16} />
              Sair
            </button>
          </form>
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#1c1c1c] text-white shadow-[0_18px_60px_rgba(28,28,28,0.18)] lg:hidden">
        <div className="flex h-16 items-center justify-between gap-3 px-4">
          <Link href="/dashboard-admin" className="flex min-w-0 items-center">
            <Image src="/nexawi-clinicas.png" alt="NexaWi Clínicas" width={156} height={42} priority className="h-9 w-auto max-w-[150px] object-contain" />
          </Link>
          <AdminMobileMenu />
        </div>
      </header>
    </>
  );
}

export default async function DashboardAdminLayout({ children }) {
  const user = await requireInternalAdmin();

  return (
    <main className="premium-shell min-h-screen overflow-x-hidden text-neutral-950" style={{ "--clinic-primary": "#ed7009", "--clinic-accent": "#ffb25b" }}>
      <DashboardAdminSidebar user={user} />
      <section className="min-w-0 lg:pl-72">
        <div className="mx-auto w-full max-w-7xl min-w-0 px-5 pb-10 pt-24 sm:px-8 lg:px-10 lg:pt-8">{children}</div>
      </section>
    </main>
  );
}
