import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarCheck, CheckCircle2, ClipboardList, CreditCard, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

const features = [
  { title: "Agenda comercial", description: "Visão diária, status visual, filtros por profissional e confirmação rápida pelo WhatsApp.", icon: CalendarCheck },
  { title: "Clientes e prontuário", description: "Ficha completa, anamnese, contraindicações, fotos antes/depois e termo de consentimento.", icon: ClipboardList },
  { title: "Financeiro simples", description: "Pagamentos, pacotes, faturamento previsto, recebido, pendências e comissões.", icon: CreditCard },
  { title: "Gestão SaaS", description: "Planos, limites, trial, inadimplência e painel interno para controlar clínicas clientes.", icon: ShieldCheck },
];

const proof = ["Menos planilhas para recepção", "Mais controle sobre retornos", "Prontuário pronto para acompanhar evolução", "Financeiro conectado à agenda"];
const plans = [
  { name: "Starter", price: "R$ 97", detail: "para clínicas em validação", limits: "3 profissionais · 300 clientes" },
  { name: "Growth", price: "R$ 197", detail: "para equipes em crescimento", limits: "10 profissionais · 2.000 clientes" },
  { name: "Premium", price: "R$ 397", detail: "para operações maiores", limits: "50 profissionais · 10.000 clientes" },
];

export const metadata = {
  title: "Clinica SaaS | Gestão para clínicas de estética",
  description: "Sistema SaaS para clínicas de estética com agenda, prontuário, financeiro, pacotes e gestão comercial.",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] text-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-[#f7f7f4]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center gap-2 text-emerald-800"><Sparkles size={19} /><span className="text-sm font-bold uppercase tracking-[0.18em]">Clinica SaaS</span></Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-neutral-600 md:flex"><a href="#recursos">Recursos</a><a href="#planos">Planos</a><Link href="/privacidade">LGPD</Link></nav>
          <Link href="/login" className="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">Entrar <ArrowRight size={16} /></Link>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-64px)] max-w-7xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:px-10 lg:py-14">
        <div className="flex flex-col justify-center">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Gestão para estética</div>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl lg:text-6xl">A clínica organizada para vender, atender e acompanhar resultados.</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-neutral-650 sm:text-lg">Agenda, clientes, prontuário, fotos de evolução, pacotes e financeiro em um painel pronto para a rotina de clínicas de estética.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800">Acessar demonstração <ArrowRight size={17} /></Link>
            <a href="#planos" className="inline-flex h-12 items-center justify-center rounded-lg border border-neutral-250 bg-white px-5 text-sm font-semibold text-neutral-850 shadow-sm transition hover:bg-neutral-50">Ver planos</a>
          </div>
          <div className="mt-8 grid gap-2 text-sm text-neutral-700 sm:grid-cols-2">{proof.map((item) => <div key={item} className="flex items-center gap-2"><CheckCircle2 size={17} className="text-emerald-700" />{item}</div>)}</div>
        </div>

        <div className="flex items-center">
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
            <Image src="/clinic-dashboard-preview.png" alt="Prévia do dashboard de uma clínica de estética" width={1200} height={900} priority className="h-auto w-full rounded-md" />
          </div>
        </div>
      </section>

      <section id="recursos" className="border-y border-neutral-200 bg-white py-14">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Produto</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">O essencial para a clínica parecer maior, sem complicar a operação.</h2></div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {features.map((feature) => { const Icon = feature.icon; return <article key={feature.title} className="rounded-lg border border-neutral-200 p-5"><Icon size={22} className="text-emerald-700" /><h3 className="mt-4 font-semibold">{feature.title}</h3><p className="mt-2 text-sm leading-6 text-neutral-600">{feature.description}</p></article>; })}
          </div>
        </div>
      </section>

      <section id="planos" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Planos</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Comece pequeno e escale a clínica.</h2></div><Link href="/login" className="inline-flex h-11 items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-semibold text-white">Entrar no painel</Link></div>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">{plans.map((plan) => <article key={plan.name} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"><h3 className="text-xl font-semibold">{plan.name}</h3><p className="mt-2 text-sm text-neutral-500">{plan.detail}</p><p className="mt-5 text-3xl font-semibold">{plan.price}<span className="text-sm font-medium text-neutral-500">/mês</span></p><p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">{plan.limits}</p></article>)}</div>
      </section>

      <footer className="border-t border-neutral-200 bg-white px-5 py-6 text-sm text-neutral-500 sm:px-8 lg:px-10"><div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p>Clinica SaaS · Gestão para clínicas de estética</p><div className="flex gap-4"><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link></div></div></footer>
    </main>
  );
}
