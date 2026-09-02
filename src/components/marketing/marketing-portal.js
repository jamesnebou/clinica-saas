import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Brain,
  Building2,
  CalendarDays,
  Check,
  Dumbbell,
  HeartPulse,
  Menu,
  Salad,
  Smile,
  Sparkles,
  Stethoscope,
  Workflow,
} from "lucide-react";
import { LeadCaptureForm } from "@/components/marketing/lead-capture-form";
import { MarketingTracking } from "@/components/marketing/marketing-tracking";
import { PlanCta } from "@/components/marketing/plan-cta";
import { TrackedLink } from "@/components/marketing/tracked-link";

const segmentIcons = {
  estetica: Sparkles,
  odontologia: Smile,
  fisioterapia: Activity,
  medicina: Stethoscope,
  psicologia: Brain,
  nutricao: Salad,
  pilates: Dumbbell,
  multidisciplinar: Building2,
};

function Brand() {
  return <Image src="/nexawi-clinicas.png" alt="NexaWi Clínicas" width={188} height={50} priority className="h-9 w-auto object-contain" />;
}

function PortalHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#171717]/95 text-white shadow-sm backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-3 px-5 sm:px-8 lg:px-10">
        <Link href="/" aria-label="NexaWi Clínicas"><Brand /></Link>
        <nav className="hidden items-center gap-7 text-sm font-bold text-white/70 lg:flex" aria-label="Navegação principal"><a href="#segmentos">Especialidades</a><a href="#plataforma">Plataforma</a><a href="#planos">Planos</a><a href="#contato">Contato</a></nav>
        <div className="flex items-center gap-2">
          <Link href="/login-cliente" className="hidden rounded-md border border-white/20 px-4 py-2.5 text-sm font-bold sm:inline-flex">Entrar</Link>
          <TrackedLink href="/cadastro" eventName="signup_click" eventData={{ location: "portal_header", segment: "geral" }} className="inline-flex h-11 items-center gap-2 rounded-md bg-[#ed7009] px-4 text-sm font-black text-white transition active:scale-[0.98]">Começar agora <ArrowRight size={16} /></TrackedLink>
          <details className="relative lg:hidden"><summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md border border-white/20" aria-label="Abrir menu"><Menu size={20} /></summary><nav className="absolute right-0 top-13 grid w-52 gap-1 rounded-lg border border-black/10 bg-white p-2 text-sm font-bold text-neutral-900 shadow-xl"><a href="#segmentos" className="rounded-md px-3 py-3 hover:bg-neutral-100">Especialidades</a><a href="#plataforma" className="rounded-md px-3 py-3 hover:bg-neutral-100">Plataforma</a><a href="#planos" className="rounded-md px-3 py-3 hover:bg-neutral-100">Planos</a></nav></details>
        </div>
      </div>
    </header>
  );
}

export function MarketingPortal({ segments, plans }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-[#151515]">
      <MarketingTracking segment="geral" pageType="marketing_portal" contentName="NexaWi Clínicas" />
      <PortalHeader />

      <section className="relative min-h-[680px] overflow-hidden bg-[#171717] text-white sm:min-h-[720px] lg:min-h-[calc(100vh-72px)]">
        <Image src="/marketing/multisegment-hero.jpg" alt="Equipe multidisciplinar organizando uma clínica com tecnologia" fill priority sizes="100vw" className="object-cover object-[68%_center] lg:object-center" />
        <div className="absolute inset-0 bg-black/60 lg:bg-black/44" />
        <div className="relative mx-auto flex min-h-[680px] max-w-7xl items-center px-5 py-16 sm:min-h-[720px] sm:px-8 lg:min-h-[calc(100vh-72px)] lg:px-10">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase text-orange-300">Uma plataforma, diferentes rotinas clínicas</p>
            <h1 className="mt-5 text-4xl font-black leading-[1.04] sm:text-6xl lg:text-7xl">Gestão que entende a especialidade sem fragmentar a clínica.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/82 sm:text-xl">Agenda, pacientes, CRM, prontuário, financeiro, site e automações conectados em uma estrutura adaptável à forma como sua equipe atende.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><TrackedLink href="#segmentos" eventName="cta_click" eventData={{ location: "portal_hero", segment: "geral" }} className="inline-flex h-13 items-center justify-center gap-2 rounded-md bg-[#ed7009] px-6 text-sm font-black transition active:scale-[0.98]">Encontrar minha especialidade <ArrowRight size={17} /></TrackedLink><TrackedLink href="/demo" eventName="demo_click" eventData={{ location: "portal_hero", segment: "geral" }} className="inline-flex h-13 items-center justify-center rounded-md border border-white/30 bg-black/25 px-6 text-sm font-black backdrop-blur transition active:scale-[0.98]">Ver demonstração</TrackedLink></div>
          </div>
        </div>
      </section>

      <section id="segmentos" className="scroll-mt-24 bg-[#f4f1eb] py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="max-w-3xl"><p className="text-xs font-black uppercase text-[#c85800]">Feita para a sua operação</p><h2 className="mt-3 text-3xl font-black leading-tight sm:text-5xl">Escolha a área que mais se aproxima da rotina da sua clínica.</h2><p className="mt-5 text-base leading-8 text-neutral-600">A base de gestão é a mesma. Terminologia, jornada e contexto operacional acompanham o segmento escolhido no cadastro.</p></div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {segments.map((segment, index) => {
              const Icon = segmentIcons[segment.slug] || Building2;
              const href = segment.slug === "estetica" ? "/estetica" : `/cadastro?segment=${segment.slug}`;
              return (
                <TrackedLink key={segment.slug} href={href} eventName={segment.slug === "estetica" ? "segment_landing_click" : "signup_click"} eventData={{ location: "segment_grid", segment: segment.slug }} className="group min-h-60 rounded-lg border border-black/10 bg-white p-6 transition hover:-translate-y-1 hover:border-[#ed7009]/50 hover:shadow-xl active:scale-[0.99]">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-md ${index % 4 === 0 ? "bg-orange-100 text-[#b95000]" : index % 4 === 1 ? "bg-cyan-100 text-cyan-800" : index % 4 === 2 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}><Icon size={22} /></div>
                  <h3 className="mt-6 text-xl font-black">{segment.name}</h3><p className="mt-3 text-sm leading-7 text-neutral-600">{segment.description}</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#c85800]">{segment.slug === "estetica" ? "Ver solução completa" : "Configurar para esta área"}<ArrowRight size={15} className="transition group-hover:translate-x-1" /></span>
                </TrackedLink>
              );
            })}
          </div>
        </div>
      </section>

      <section id="plataforma" className="scroll-mt-24 bg-white py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:px-10">
          <div><p className="text-xs font-black uppercase text-teal-700">Visão integrada</p><h2 className="mt-3 text-3xl font-black leading-tight sm:text-5xl">Da entrada do paciente à leitura do caixa.</h2><p className="mt-5 text-base leading-8 text-neutral-600">A NexaWi conecta as áreas que sustentam uma clínica: aquisição, agenda, atendimento, relacionamento, cobrança e decisão.</p><div className="mt-8 grid gap-3 text-sm font-bold text-neutral-700 sm:grid-cols-2">{["Agenda e disponibilidade", "CRM e follow-ups", "Prontuário e consentimentos", "Financeiro e comissões", "Site e sinal online", "BI e automações"].map((item) => <span key={item} className="flex gap-2"><Check size={18} className="shrink-0 text-emerald-700" />{item}</span>)}</div></div>
          <div className="overflow-hidden rounded-lg border border-black/10 bg-[#e8e4dc] p-3 shadow-[0_28px_80px_rgba(20,20,20,0.16)] sm:p-5"><div className="mb-3 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /><span className="ml-2 text-xs font-bold text-neutral-500">Operação NexaWi</span></div><Image src="/clinic-dashboard-preview.png" alt="Dashboard da plataforma NexaWi Clínicas" width={1400} height={1000} sizes="(max-width: 1024px) 100vw, 58vw" className="h-auto w-full rounded-md border border-black/10 bg-white" /></div>
        </div>
      </section>

      <section className="bg-[#171717] py-20 text-white sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"><div className="max-w-3xl"><p className="text-xs font-black uppercase text-orange-300">Operação conectada</p><h2 className="mt-3 text-3xl font-black leading-tight sm:text-5xl">Uma estrutura comum para equipes com necessidades diferentes.</h2></div><div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-white/12 bg-white/12 md:grid-cols-3">{[{icon:CalendarDays,title:"Atendimento",text:"Agenda, cadastro e histórico acompanham a terminologia do segmento."},{icon:Workflow,title:"Crescimento",text:"CRM, site, origem de leads e automações apoiam o relacionamento."},{icon:HeartPulse,title:"Gestão",text:"Financeiro, BI, pacotes e comissões organizam a leitura da operação."}].map((item) => {const Icon=item.icon;return <article key={item.title} className="bg-[#202020] p-7"><Icon className="text-orange-300" size={25}/><h3 className="mt-6 text-2xl font-black">{item.title}</h3><p className="mt-3 text-sm leading-7 text-white/66">{item.text}</p></article>;})}</div></div>
      </section>

      <section id="planos" className="scroll-mt-24 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"><div className="mx-auto max-w-3xl text-center"><p className="text-xs font-black uppercase text-[#c85800]">Planos atuais</p><h2 className="mt-3 text-3xl font-black leading-tight sm:text-5xl">Capacidade para começar e continuar crescendo.</h2><p className="mt-5 text-base leading-8 text-neutral-600">Os valores e limites abaixo vêm da configuração comercial atual.</p></div><div className="mt-12 grid gap-5 lg:grid-cols-3">{plans.map((plan) => <article key={plan.slug} className={`rounded-lg border p-7 ${plan.highlight ? "border-[#ed7009] bg-[#1c1c1c] text-white" : "border-black/10 bg-[#f8f7f4]"}`}><div className="flex items-center justify-between gap-3"><h3 className="text-2xl font-black">{plan.name}</h3><span className={`rounded-full px-3 py-1 text-xs font-black ${plan.highlight ? "bg-[#ed7009]" : "bg-orange-100 text-[#9d4500]"}`}>{plan.badge}</span></div><p className={`mt-4 min-h-14 text-sm leading-7 ${plan.highlight ? "text-white/68" : "text-neutral-600"}`}>{plan.description}</p><p className="mt-7 text-4xl font-black">{plan.price}<span className={`text-sm ${plan.highlight ? "text-white/55" : "text-neutral-500"}`}>/mês</span></p><ul className={`mt-7 space-y-3 border-t pt-6 text-sm ${plan.highlight ? "border-white/12 text-white/78" : "border-black/10"}`}>{plan.limits.map((limit) => <li key={limit} className="flex gap-2"><Check size={17} className="text-emerald-500" />{limit}</li>)}</ul><PlanCta plan={plan.slug} featured={plan.highlight}/></article>)}</div></div>
      </section>

      <LeadCaptureForm segment="geral" eyebrow="Conversa comercial" title="Mostre como sua clínica funciona. A NexaWi mostra como organizar." description="Informe sua equipe e o segmento no nome da clínica. A conversa parte do seu cenário, sem demonstração genérica." />

      <footer className="border-t border-white/10 bg-[#171717] px-5 py-10 text-white sm:px-8 lg:px-10"><div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><Brand/><div className="flex flex-wrap gap-5 text-sm font-bold text-white/60"><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link></div></div></footer>
    </main>
  );
}
