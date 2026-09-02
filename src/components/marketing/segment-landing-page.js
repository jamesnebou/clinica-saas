import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Globe2,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
  Workflow,
} from "lucide-react";
import { LeadCaptureForm } from "@/components/marketing/lead-capture-form";
import { MarketingTracking } from "@/components/marketing/marketing-tracking";
import { PlanCta } from "@/components/marketing/plan-cta";
import { TrackedLink } from "@/components/marketing/tracked-link";

const iconMap = {
  calendar: CalendarDays,
  users: UsersRound,
  clipboard: ClipboardCheck,
  wallet: WalletCards,
  globe: Globe2,
  workflow: Workflow,
  chart: BarChart3,
  shield: ShieldCheck,
};

function Brand() {
  return <Image src="/nexawi-clinicas.png" alt="NexaWi Clínicas" width={188} height={50} priority className="h-9 w-auto object-contain" />;
}

function Header({ segment }) {
  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <Link href="/" aria-label="Voltar para NexaWi Clínicas"><Brand /></Link>
        <nav className="hidden items-center gap-7 text-sm font-bold text-neutral-600 lg:flex" aria-label="Navegação principal">
          <a href="#solucao" className="hover:text-black">Solução</a>
          <a href="#recursos" className="hover:text-black">Recursos</a>
          <a href="#planos" className="hover:text-black">Planos</a>
          <a href="#faq" className="hover:text-black">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login-cliente" className="hidden rounded-md border border-black/10 px-4 py-2.5 text-sm font-bold text-neutral-700 transition active:scale-[0.98] sm:inline-flex">Entrar</Link>
          <TrackedLink href="#contato" eventName="cta_click" eventData={{ location: "header", segment }} className="inline-flex h-11 items-center gap-2 rounded-md bg-[#ed7009] px-4 text-sm font-black text-white transition active:scale-[0.98]">
            Falar com especialista <ArrowRight size={16} />
          </TrackedLink>
          <details className="relative lg:hidden">
            <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md border border-black/10 bg-white" aria-label="Abrir menu"><Menu size={20} /></summary>
            <nav className="absolute right-0 top-13 grid w-52 gap-1 rounded-lg border border-black/10 bg-white p-2 text-sm font-bold shadow-xl" aria-label="Navegação móvel">
              <a href="#solucao" className="rounded-md px-3 py-3 hover:bg-neutral-100">Solução</a>
              <a href="#recursos" className="rounded-md px-3 py-3 hover:bg-neutral-100">Recursos</a>
              <a href="#planos" className="rounded-md px-3 py-3 hover:bg-neutral-100">Planos</a>
              <a href="#faq" className="rounded-md px-3 py-3 hover:bg-neutral-100">FAQ</a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

function SectionHeading({ eyebrow, title, description, light = false, center = false }) {
  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className={`text-xs font-black uppercase ${light ? "text-orange-300" : "text-[#c85800]"}`}>{eyebrow}</p>
      <h2 className={`mt-3 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl ${light ? "text-white" : "text-[#151515]"}`}>{title}</h2>
      {description ? <p className={`mt-5 text-base leading-8 ${light ? "text-white/70" : "text-neutral-600"}`}>{description}</p> : null}
    </div>
  );
}

function Hero({ config }) {
  return (
    <section className="relative min-h-[680px] overflow-hidden bg-[#171717] text-white sm:min-h-[720px] lg:min-h-[calc(100vh-72px)]">
      <Image src={config.hero.image} alt={config.hero.imageAlt} fill priority sizes="100vw" className="object-cover object-[68%_center] lg:object-center" />
      <div className="absolute inset-0 bg-black/58 lg:bg-black/45" />
      <div className="relative mx-auto flex min-h-[680px] max-w-7xl items-center px-5 py-16 sm:min-h-[720px] sm:px-8 lg:min-h-[calc(100vh-72px)] lg:px-10">
        <div className="max-w-3xl">
          <p className="text-sm font-black uppercase text-orange-300">{config.hero.eyebrow}</p>
          <h1 className="mt-5 text-4xl font-black leading-[1.04] sm:text-6xl lg:text-7xl">{config.hero.title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/82 sm:text-xl">{config.hero.description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <TrackedLink href={config.hero.primaryCta.href} eventName="cta_click" eventData={{ location: "hero_primary", segment: config.slug }} className="inline-flex h-13 items-center justify-center gap-2 rounded-md bg-[#ed7009] px-6 text-sm font-black text-white shadow-xl transition active:scale-[0.98]">
              {config.hero.primaryCta.label} <ArrowRight size={17} />
            </TrackedLink>
            <TrackedLink href={config.hero.secondaryCta.href} eventName="demo_click" eventData={{ location: "hero_secondary", segment: config.slug }} className="inline-flex h-13 items-center justify-center gap-2 rounded-md border border-white/30 bg-black/25 px-6 text-sm font-black text-white backdrop-blur transition active:scale-[0.98]">
              {config.hero.secondaryCta.label}
            </TrackedLink>
          </div>
          <div className="mt-8 grid max-w-2xl gap-3 text-sm font-bold text-white/80 sm:grid-cols-3">
            {config.hero.points.map((point) => <span key={point} className="flex items-start gap-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-orange-300" />{point}</span>)}
          </div>
        </div>
      </div>
    </section>
  );
}

function PainSection({ config }) {
  return (
    <section id="solucao" className="bg-[#f4f1eb] py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <SectionHeading eyebrow="O problema não é falta de esforço" title="Uma clínica pode atender muito e ainda perder controle, tempo e receita." description="Quando cada etapa vive em uma ferramenta diferente, a equipe precisa reconstruir o contexto o dia inteiro. A NexaWi organiza esse caminho sem tirar a identidade da sua clínica." />
        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-black/10 bg-black/10 md:grid-cols-2 xl:grid-cols-4">
          {config.pains.map((pain, index) => (
            <article key={pain.title} className="min-h-56 bg-white p-6">
              <span className="text-sm font-black text-[#ed7009]">0{index + 1}</span>
              <h3 className="mt-6 text-xl font-black">{pain.title}</h3>
              <p className="mt-3 text-sm leading-7 text-neutral-600">{pain.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TransformationSection() {
  const comparisons = [
    ["Antes", "Depois com a NexaWi"],
    ["Conversas espalhadas e sem dono", "Oportunidades com etapa, responsável e próxima ação"],
    ["Agenda sem relação com recebimentos", "Agendamento, sinal e status financeiro conectados"],
    ["Histórico difícil de localizar", "Prontuário e evolução reunidos por paciente"],
    ["Decisões por percepção", "Indicadores de agenda, receita e operação por período"],
  ];
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-10">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100">
          <Image src="/marketing/estetica/consultation.jpg" alt="Profissional de estética apresentando um plano de atendimento a uma paciente" fill sizes="(max-width: 1024px) 100vw, 48vw" className="object-cover" />
        </div>
        <div>
          <SectionHeading eyebrow="Mudança operacional" title="A experiência melhora para quem administra, atende e compra." description="O sistema não substitui o cuidado humano. Ele retira ruído operacional para que a equipe consiga acompanhar cada paciente com consistência." />
          <div className="mt-8 overflow-hidden rounded-lg border border-black/10">
            {comparisons.map(([left, right], index) => (
              <div key={left} className={`grid gap-3 p-4 sm:grid-cols-2 ${index ? "border-t border-black/10" : "bg-[#1c1c1c] font-black text-white"}`}>
                <span className={index ? "text-neutral-500" : ""}>{left}</span>
                <span className={index ? "font-bold text-neutral-900" : ""}>{right}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ModulesSection({ config }) {
  return (
    <section id="recursos" className="bg-[#181818] py-20 text-white sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <SectionHeading light center eyebrow="Uma plataforma conectada" title="Os módulos seguem a jornada da clínica, não uma coleção de telas isoladas." description="Cada área compartilha o contexto necessário para reduzir lançamentos repetidos e dar visibilidade ao trabalho da equipe." />
        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {config.modules.map((module, index) => {
            const Icon = iconMap[module.icon] || Sparkles;
            const accents = ["text-orange-300", "text-cyan-300", "text-rose-300", "text-emerald-300"];
            return (
              <article key={module.title} className="rounded-lg border border-white/12 bg-white/[0.05] p-6">
                <Icon size={25} className={accents[index % accents.length]} />
                <h3 className="mt-5 text-xl font-black">{module.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/66">{module.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WorkflowSection({ config }) {
  return (
    <section className="bg-[#eef6f5] py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <SectionHeading eyebrow="Do interesse ao retorno" title="Um fluxo contínuo para não perder o contexto entre uma etapa e outra." center />
        <ol className="mt-12 grid gap-4 lg:grid-cols-5">
          {config.workflow.map((step, index) => (
            <li key={step.label} className="relative rounded-lg border border-teal-900/10 bg-white p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-sm font-black text-white">{index + 1}</span>
              <h3 className="mt-5 text-lg font-black">{step.label}</h3>
              <p className="mt-2 text-sm leading-7 text-neutral-600">{step.description}</p>
              {index < config.workflow.length - 1 ? <ChevronRight className="absolute -right-3 top-8 z-10 hidden text-teal-700 lg:block" size={20} /> : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ProductSection() {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:px-10">
        <div>
          <SectionHeading eyebrow="Produto real" title="A operação inteira visível sem perder tempo procurando informação." description="A demonstração utiliza o mesmo painel da plataforma, com dados fictícios restauráveis para você explorar agenda, CRM, prontuário, financeiro, BI e automações." />
          <TrackedLink href="/demo" eventName="demo_click" eventData={{ location: "product_showcase", segment: "estetica" }} className="mt-7 inline-flex h-12 items-center gap-2 rounded-md bg-[#1c1c1c] px-5 text-sm font-black text-white transition active:scale-[0.98]">
            Explorar a demonstração <ArrowRight size={17} />
          </TrackedLink>
        </div>
        <div className="overflow-hidden rounded-lg border border-black/10 bg-[#e8e4dc] p-3 shadow-[0_28px_80px_rgba(20,20,20,0.16)] sm:p-5">
          <div className="mb-3 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /><span className="ml-2 text-xs font-bold text-neutral-500">Painel NexaWi Clínicas</span></div>
          <Image src="/clinic-dashboard-preview.png" alt="Visão do dashboard operacional da NexaWi Clínicas" width={1400} height={1000} sizes="(max-width: 1024px) 100vw, 58vw" className="h-auto w-full rounded-md border border-black/10 bg-white" />
        </div>
      </div>
    </section>
  );
}

function RolesSection({ config }) {
  return (
    <section className="bg-[#f4f1eb] py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <SectionHeading eyebrow="A mesma operação, visões responsáveis" title="Cada função encontra o que precisa para trabalhar." description="O painel organiza a rotina por responsabilidade, com navegação e permissões adequadas à equipe." />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {config.roles.map((role, index) => (
            <article key={role.title} className="rounded-lg border border-black/10 bg-white p-7">
              <span className={`text-sm font-black ${index === 0 ? "text-[#c85800]" : index === 1 ? "text-teal-700" : "text-rose-700"}`}>0{index + 1}</span>
              <h3 className="mt-4 text-2xl font-black">{role.title}</h3>
              <ul className="mt-6 space-y-3 text-sm leading-7 text-neutral-600">
                {role.items.map((item) => <li key={item} className="flex gap-2"><Check size={18} className="mt-1 shrink-0 text-emerald-700" />{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function AutomationSection() {
  const items = [
    { icon: Clock3, title: "Esperas e tarefas", description: "Ações podem aguardar o momento configurado e voltar para processamento com controle de concorrência e tentativas." },
    { icon: MessageCircle, title: "Comunicação conectada", description: "Notificações e a central de WhatsApp apoiam confirmações e acompanhamento conforme a configuração da clínica." },
    { icon: BarChart3, title: "Origem comercial", description: "UTMs e atribuição first/last touch ajudam a entender de onde chegam as oportunidades do site NexaWi." },
  ];
  return (
    <section className="bg-[#171717] py-20 text-white sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:px-10">
        <SectionHeading light eyebrow="Automação com contexto" title="A tecnologia acompanha o processo sem tomar decisões clínicas." description="O motor trabalha sobre eventos operacionais e mantém histórico de execução. A equipe continua no controle das regras publicadas." />
        <div className="grid gap-4">
          {items.map((item, index) => {
            const Icon = item.icon;
            return <article key={item.title} className="grid gap-4 rounded-lg border border-white/12 bg-white/[0.05] p-6 sm:grid-cols-[auto_1fr]"><div className={`flex h-11 w-11 items-center justify-center rounded-md ${index === 0 ? "bg-orange-400/15 text-orange-300" : index === 1 ? "bg-emerald-400/15 text-emerald-300" : "bg-cyan-400/15 text-cyan-300"}`}><Icon size={22} /></div><div><h3 className="text-xl font-black">{item.title}</h3><p className="mt-2 text-sm leading-7 text-white/66">{item.description}</p></div></article>;
          })}
        </div>
      </div>
    </section>
  );
}

function PlansSection({ plans }) {
  return (
    <section id="planos" className="scroll-mt-24 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <SectionHeading center eyebrow="Planos" title="Comece com a capacidade que sua clínica precisa hoje." description="Preços e limites são carregados da configuração comercial atual da NexaWi." />
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.slug} className={`rounded-lg border p-7 ${plan.highlight ? "border-[#ed7009] bg-[#1c1c1c] text-white shadow-[0_26px_70px_rgba(237,112,9,0.18)]" : "border-black/10 bg-[#f8f7f4]"}`}>
              <div className="flex items-center justify-between gap-4"><h3 className="text-2xl font-black">{plan.name}</h3><span className={`rounded-full px-3 py-1 text-xs font-black ${plan.highlight ? "bg-[#ed7009] text-white" : "bg-orange-100 text-[#9d4500]"}`}>{plan.badge}</span></div>
              <p className={`mt-4 min-h-14 text-sm leading-7 ${plan.highlight ? "text-white/68" : "text-neutral-600"}`}>{plan.description}</p>
              <p className="mt-7 text-4xl font-black">{plan.price}<span className={`text-sm ${plan.highlight ? "text-white/55" : "text-neutral-500"}`}>/mês</span></p>
              <ul className={`mt-7 space-y-3 border-t pt-6 text-sm ${plan.highlight ? "border-white/12 text-white/78" : "border-black/10 text-neutral-700"}`}>
                {plan.limits.map((limit) => <li key={limit} className="flex gap-2"><Check size={17} className="shrink-0 text-emerald-500" />{limit}</li>)}
              </ul>
              <p className={`mt-6 text-sm leading-6 ${plan.highlight ? "text-white/68" : "text-neutral-600"}`}>{plan.summary}</p>
              <PlanCta plan={plan.slug} featured={plan.highlight} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SafetySection() {
  return (
    <section className="border-y border-black/10 bg-[#eef6f5] py-16">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[auto_1fr_1fr_1fr] lg:items-start lg:px-10">
        <ShieldCheck size={38} className="text-teal-700" />
        <div><h3 className="font-black">Separação por clínica</h3><p className="mt-2 text-sm leading-7 text-neutral-600">Dados operacionais são associados ao contexto da clínica e protegidos pelas políticas de acesso do sistema.</p></div>
        <div><h3 className="font-black">Papéis e permissões</h3><p className="mt-2 text-sm leading-7 text-neutral-600">Gestão, recepção, financeiro e profissionais operam com responsabilidades diferentes.</p></div>
        <div><h3 className="font-black">LGPD no processo</h3><p className="mt-2 text-sm leading-7 text-neutral-600">Consentimentos, privacidade e exclusão de dados fazem parte da estrutura pública e operacional.</p></div>
      </div>
    </section>
  );
}

function FaqSection({ config }) {
  return (
    <section id="faq" className="scroll-mt-24 bg-[#f4f1eb] py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-5 sm:px-8 lg:px-10">
        <SectionHeading center eyebrow="Perguntas frequentes" title="Informação clara antes da decisão." description="Respostas sobre operação, pagamentos, implantação e uso da plataforma." />
        <div className="mt-10 grid gap-3">
          {config.faqs.map(([question, answer]) => (
            <details key={question} className="group rounded-lg border border-black/10 bg-white p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-black"><span>{question}</span><ChevronRight size={18} className="shrink-0 text-[#ed7009] transition group-open:rotate-90" /></summary>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-neutral-600">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#171717] px-5 py-10 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><Brand /><div className="flex flex-wrap gap-5 text-sm font-bold text-white/60"><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link></div></div>
    </footer>
  );
}

export function SegmentLandingPage({ config, plans }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-[#151515]">
      <MarketingTracking segment={config.slug} pageType="segment_landing" contentName={`NexaWi Clínicas para ${config.name}`} />
      <Header segment={config.slug} />
      <Hero config={config} />
      <PainSection config={config} />
      <TransformationSection />
      <ModulesSection config={config} />
      <WorkflowSection config={config} />
      <ProductSection />
      <RolesSection config={config} />
      <AutomationSection />
      <PlansSection plans={plans} />
      <SafetySection />
      <FaqSection config={config} />
      <LeadCaptureForm segment={config.slug} eyebrow="Próximo passo" title="Veja a NexaWi aplicada à rotina da sua clínica de estética." description="Informe o tamanho da sua equipe. A NexaWi apresenta o fluxo e o plano mais coerentes com a operação atual." />
      <Footer />
    </main>
  );
}
