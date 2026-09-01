import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, CalendarCheck, ChartNoAxesCombined, Sparkles } from "lucide-react";
import { MarketingTracking } from "@/components/marketing/marketing-tracking";
import { getUserClinics } from "@/lib/auth/session";
import { isDemoLoginEmail } from "@/lib/demo/demo-account";
import { normalizeSelectedPlan } from "@/lib/auth/self-service.mjs";
import CadastroForm from "./cadastro-form";

export const metadata = {
  title: "Criar conta | NexaWi Clínicas",
  description: "Crie sua conta NexaWi Clínicas e configure sua clínica em poucos minutos.",
};

export default async function CadastroPage({ searchParams }) {
  const params = await searchParams;
  const selectedPlan = normalizeSelectedPlan(params?.plan);
  const { user, activeClinic } = await getUserClinics();

  if (user && isDemoLoginEmail(user.email)) {
    redirect(`/auth/leave-demo?next=${encodeURIComponent(`/cadastro?plan=${selectedPlan}`)}`);
  }
  if (user && activeClinic) redirect("/dashboard");
  if (user) redirect(`/onboarding?plan=${selectedPlan}`);

  return (
    <main className="grid min-h-screen bg-[#f7f7f4] text-neutral-950 lg:grid-cols-[0.9fr_1.1fr]">
      <MarketingTracking segment="geral" pageType="self_service_signup" contentName="Cadastro NexaWi Clínicas" />
      <section className="hidden min-h-screen flex-col justify-between border-r border-neutral-200 bg-[#1c1c1c] p-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2 text-orange-300">
          <Sparkles size={20} />
          <span className="text-sm font-bold uppercase tracking-[0.18em]">NexaWi Clínicas</span>
        </Link>
        <div className="max-w-xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">Sua operação começa aqui</p>
          <h1 className="mt-4 text-5xl font-black leading-tight">Estruture sua clínica para vender e atender melhor.</h1>
          <p className="mt-5 text-base leading-8 text-white/68">Crie sua credencial agora. A clínica será configurada com segurança na próxima etapa.</p>
          <div className="mt-8 grid gap-3">
            <div className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.06] p-4"><CalendarCheck className="shrink-0 text-orange-300" size={22} /><p className="text-sm leading-6 text-white/72">Agenda, CRM, prontuário, financeiro e site integrados.</p></div>
            <div className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.06] p-4"><ChartNoAxesCombined className="shrink-0 text-orange-300" size={22} /><p className="text-sm leading-6 text-white/72">Trial organizado sem ativar cobrança automaticamente.</p></div>
          </div>
        </div>
        <p className="text-xs text-white/45">Seus dados de acesso não são compartilhados com outras clínicas.</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-2xl">
          <Link href="/" className="mb-8 flex items-center gap-2 text-[#ed7009] lg:hidden"><Sparkles size={19} /><span className="text-sm font-bold uppercase tracking-[0.18em]">NexaWi Clínicas</span></Link>
          <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-50 text-[#ed7009]"><BadgeCheck size={21} /></div>
            <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-[#ed7009]">Novo Cadastro</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Crie sua conta NexaWi Clínicas</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">Depois do cadastro, você informará os dados da clínica e entrará no dashboard.</p>
            <CadastroForm selectedPlan={selectedPlan} />
          </div>
          <p className="mt-5 text-center text-sm text-neutral-600">Já tem uma conta? <Link href="/login-cliente" className="font-black text-[#ed7009]">Entrar</Link></p>
        </div>
      </section>
    </main>
  );
}
