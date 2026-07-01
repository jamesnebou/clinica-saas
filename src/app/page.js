import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileText,
  Globe2,
  HeartPulse,
  MessageCircle,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";

const modules = [
  {
    title: "Agenda inteligente",
    description: "Horários disponíveis, status visual, conflito por profissional, sinal online e confirmação rápida.",
    icon: CalendarDays,
  },
  {
    title: "Clientes e prontuário",
    description: "Ficha completa, anamnese, contraindicações, termos, fotos antes/depois e histórico de evolução.",
    icon: ClipboardCheck,
  },
  {
    title: "CRM comercial",
    description: "Pipeline de leads, origem, follow-up, oportunidades por etapa e conversão em cliente.",
    icon: UsersRound,
  },
  {
    title: "Financeiro da clínica",
    description: "Pagamentos, pacotes, comissões, faturamento previsto, recebido e pendências por período.",
    icon: WalletCards,
  },
  {
    title: "Site de vendas incluso",
    description: "Página premium para cada clínica com procedimentos, depoimentos, localização e agendamento online.",
    icon: Globe2,
  },
  {
    title: "Assinatura SaaS",
    description: "Planos, limites, trial, inadimplência, Asaas e painel interno para gestão das clínicas.",
    icon: ShieldCheck,
  },
];

const workflow = [
  "A cliente entra no site da clínica",
  "Escolhe procedimento e horário disponível",
  "Paga o sinal pelo checkout",
  "Cai no CRM e na agenda automaticamente",
  "A clínica acompanha financeiro, prontuário e retorno",
];

const outcomes = [
  "Menos planilhas e menos retrabalho na recepção",
  "Mais controle sobre agenda, faltas e retornos",
  "Venda de pacotes e sinal online no mesmo fluxo",
  "Prontuário organizado para aumentar valor percebido",
];

const plans = [
  {
    name: "Starter",
    price: "R$ 97",
    description: "Para clínicas em validação comercial.",
    limits: "3 profissionais, 300 clientes e 500 agendamentos por mês.",
  },
  {
    name: "Growth",
    price: "R$ 197",
    description: "Para clínicas com equipe e rotina ativa.",
    limits: "10 profissionais, 2.000 clientes e 3.000 agendamentos por mês.",
    highlight: true,
  },
  {
    name: "Premium",
    price: "R$ 397",
    description: "Para operações maiores e redes locais.",
    limits: "50 profissionais, 10.000 clientes e alto volume comercial.",
  },
];

function LogoMark() {
  return (
    <Image src="/nexawi-clinicas.png" alt="NexaWi Clínicas" width={180} height={48} priority className="h-10 w-auto object-contain" />
  );
}

function SectionTitle({ eyebrow, title, description, align = "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="text-xs font-black uppercase text-[#ed7009]">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black leading-tight text-[#081512] sm:text-5xl">{title}</h2>
      {description ? <p className="mt-4 text-base leading-8 text-neutral-600">{description}</p> : null}
    </div>
  );
}

export const metadata = {
  title: "NexaWi Clínicas | SaaS para clínicas de estética",
  description: "Sistema SaaS para clínicas de estética com agenda, site de vendas, CRM, prontuário, financeiro e checkout online.",
};

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f2ed] text-[#09110f]">
      <header className="sticky top-0 z-50 border-b border-black/10 bg-[#f4f2ed]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center gap-3">
            <LogoMark />
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-bold text-neutral-600 lg:flex">
            <a href="#produto">Produto</a>
            <a href="#site">Site da clínica</a>
            <a href="#planos">Planos</a>
            <a href="#demo">Demonstração</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login-cliente" className="hidden rounded-full border border-black/10 bg-white/60 px-4 py-2.5 text-sm font-bold text-neutral-700 shadow-sm sm:inline-flex">
              Entrar
            </Link>
            <a href="#demo" className="inline-flex items-center gap-2 rounded-full bg-[#071e1a] px-5 py-3 text-sm font-black text-white shadow-[0_18px_42px_rgba(7,30,26,0.24)]">
              Quero vender mais <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </header>

      <section className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_8%,rgba(237,112,9,0.22),transparent_30rem),radial-gradient(circle_at_92%_0%,rgba(219,39,119,0.14),transparent_28rem)]" />
        <div className="relative mx-auto grid min-h-[calc(100vh-72px)] max-w-7xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[0.93fr_1.07fr] lg:px-10 lg:py-16">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#ed7009]/20 bg-white/70 px-4 py-2 text-xs font-black uppercase text-[#ed7009] shadow-sm backdrop-blur">
              <BadgeCheck size={15} /> Gestão, vendas e atendimento para estética
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.98] text-[#07110f] sm:text-6xl lg:text-7xl">
              A clínica organizada para vender antes, atender melhor e voltar a faturar depois.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
              NexaWi Clínicas reúne agenda, CRM, prontuário, financeiro, site premium e checkout de sinal em uma operação simples para clínicas de estética.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[#071e1a] px-6 text-sm font-black text-white shadow-[0_22px_56px_rgba(7,30,26,0.26)]">
                Testar demo livre <ArrowRight size={17} />
              </Link>
              <a href="#produto" className="inline-flex h-13 items-center justify-center rounded-full border border-black/10 bg-white/70 px-6 text-sm font-black text-neutral-800 shadow-sm backdrop-blur">
                Ver como funciona
              </a>
            </div>
            <div className="mt-9 grid gap-3 text-sm font-semibold text-neutral-700 sm:grid-cols-2">
              {outcomes.map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#ed7009]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center">
            <div className="relative w-full">
              <div className="absolute -inset-6 rounded-[2.5rem] bg-[radial-gradient(circle_at_80%_20%,rgba(237,112,9,0.25),transparent_18rem),radial-gradient(circle_at_10%_90%,rgba(244,114,182,0.20),transparent_18rem)] blur-2xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/72 p-3 shadow-[0_32px_100px_rgba(20,18,15,0.16)] backdrop-blur">
                <div className="rounded-[1.5rem] bg-[#071e1a] p-4 text-white">
                  <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                    <div>
                      <p className="text-xs font-bold text-orange-200">Painel operacional</p>
                      <h2 className="text-xl font-black">Clínica Bella Skin</h2>
                    </div>
                    <span className="rounded-full bg-[#ed7009] px-3 py-1 text-xs font-black text-white">Ativa</span>
                  </div>
                  <div className="grid gap-3 py-4 sm:grid-cols-3">
                    {[
                      ["Confirmados", "18"],
                      ["Receita prevista", "R$ 4.680"],
                      ["Leads novos", "12"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl bg-white/8 p-4">
                        <p className="text-xs text-white/54">{label}</p>
                        <p className="mt-2 text-2xl font-black">{value}</p>
                      </div>
                    ))}
                  </div>
                  <Image src="/clinic-dashboard-preview.png" alt="Prévia do dashboard NexaWi Clínicas" width={1200} height={900} priority className="h-auto w-full rounded-[1.15rem] border border-white/10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="produto" className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <SectionTitle
            eyebrow="Produto"
            title="Tudo que uma clínica precisa para operar com aparência de empresa grande."
            description="A plataforma foi pensada para rotina real: recepção, profissional, financeiro, vendas, retorno, prontuário e site público trabalhando juntos."
            align="center"
          />
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {modules.map((module) => {
              const Icon = module.icon;
              return (
                <article key={module.title} className="group rounded-[1.5rem] border border-neutral-200 bg-[#fbfaf7] p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(7,30,26,0.12)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-[#ed7009]">
                    <Icon size={23} />
                  </div>
                  <h3 className="mt-5 text-xl font-black">{module.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-neutral-600">{module.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative bg-[#081512] px-5 py-20 text-white sm:px-8 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(237,112,9,0.22),transparent_26rem),radial-gradient(circle_at_82%_18%,rgba(244,114,182,0.11),transparent_22rem)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase text-orange-300">Fluxo comercial</p>
            <h2 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">Da primeira visita no site ao retorno recomendado.</h2>
            <p className="mt-5 text-base leading-8 text-white/68">
              O objetivo não é só cadastrar dados. É transformar interesse em agendamento, agendamento em pagamento, atendimento em histórico e histórico em retorno.
            </p>
          </div>
          <div className="rounded-[2rem] border border-white/12 bg-white/[0.06] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur">
            <div className="grid gap-3">
              {workflow.map((item, index) => (
                <div key={item} className="flex items-center gap-4 rounded-2xl bg-white/[0.06] p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ed7009] text-sm font-black text-white">{index + 1}</span>
                  <span className="font-bold text-white/86">{item}</span>
                  <ChevronRight size={18} className="ml-auto hidden text-white/30 sm:block" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="site" className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1fr] lg:px-10 lg:items-center">
        <div>
          <SectionTitle
            eyebrow="Site de vendas"
            title="Cada clínica ganha um site premium para gerar demanda, não só uma página bonita."
            description="Procedimentos, fotos, depoimentos, localização, WhatsApp, agendamento e checkout de sinal conectados diretamente ao SaaS da clínica."
          />
          <div className="mt-8 grid gap-4">
            {[
              ["Domínio próprio", "A clínica pode usar o próprio domínio, com roteamento para o site certo dentro da plataforma."],
              ["Agendamento online", "Horários disponíveis seguem a agenda real e evitam conflito com profissional."],
              ["Pagamento de sinal", "Checkout Asaas para reduzir desistência e registrar status dentro do agendamento."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-neutral-200 bg-white/70 p-5 shadow-sm">
                <h3 className="font-black">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-neutral-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-6 rounded-[2.5rem] bg-[radial-gradient(circle_at_70%_20%,rgba(237,112,9,0.22),transparent_18rem)] blur-2xl" />
          <div className="relative">
            <Image
              src="/mockup-notebook.png"
              alt="Site da clínica dentro de um notebook"
              width={1400}
              height={900}
              className="pointer-events-none relative z-20 h-auto w-full drop-shadow-[0_34px_70px_rgba(20,18,15,0.22)]"
            />
            <div className="absolute left-[13%] top-[20%] z-10 h-[50%] w-[74%] overflow-hidden rounded-[0.65rem] bg-[#ffffff]">
              <div className="h-full w-full overflow-auto">
                <iframe
                  src="/c/studio-ingrid-silva"
                  title="Site público demonstrativo da clínica"
                  className="origin-top-left border-0"
                  style={{
                    width: "1280px",
                    height: "920px",
                    transform: "scale(0.33)",
                  }}
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Recepção", value: "agenda, WhatsApp e status", icon: MessageCircle },
              { label: "Profissional", value: "prontuário e comissão", icon: HeartPulse },
              { label: "Gestor", value: "faturamento e indicadores", icon: BarChart3 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.label} className="rounded-[1.5rem] border border-neutral-200 bg-[#f7f5f0] p-6">
                  <Icon size={24} className="text-[#ed7009]" />
                  <p className="mt-5 text-sm font-bold text-neutral-500">{item.label}</p>
                  <h3 className="mt-2 text-2xl font-black">{item.value}</h3>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="planos" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
        <SectionTitle eyebrow="Planos" title="Planos simples para começar, vender e escalar." description="A clínica entra com uma estrutura pronta e você controla limites, trial, inadimplência e cobrança." align="center" />
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.name} className={`rounded-[1.75rem] border p-6 shadow-sm ${plan.highlight ? "border-[#ed7009]/60 bg-[#071e1a] text-white shadow-[0_30px_90px_rgba(237,112,9,0.20)]" : "border-neutral-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-2xl font-black">{plan.name}</h3>
                {plan.highlight ? <span className="rounded-full bg-[#ed7009] px-3 py-1 text-xs font-black text-white">Mais vendido</span> : null}
              </div>
              <p className={`mt-3 text-sm leading-7 ${plan.highlight ? "text-white/68" : "text-neutral-600"}`}>{plan.description}</p>
              <p className="mt-7 text-4xl font-black">{plan.price}<span className={`text-sm font-bold ${plan.highlight ? "text-white/58" : "text-neutral-500"}`}>/mês</span></p>
              <p className={`mt-5 rounded-2xl p-4 text-sm leading-6 ${plan.highlight ? "bg-white/8 text-white/74" : "bg-neutral-50 text-neutral-600"}`}>{plan.limits}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="demo" className="px-5 pb-20 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-8 rounded-[2rem] bg-[#071e1a] p-7 text-white shadow-[0_34px_100px_rgba(7,30,26,0.24)] lg:grid-cols-[1fr_0.85fr] lg:p-10">
          <div>
            <p className="text-xs font-black uppercase text-orange-300">Demonstração</p>
            <h2 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">Pronto para vender para clínicas com uma apresentação profissional.</h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-white/68">
              Use a demo para mostrar agenda, cliente, prontuário, CRM, financeiro, assinatura e site público da clínica em um roteiro comercial claro.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-black text-[#071e1a]">
                Testar demo livre <ArrowRight size={17} />
              </Link>
              <a href="https://wa.me/5577999911911" target="_blank" className="inline-flex h-13 items-center justify-center gap-2 rounded-full border border-white/16 px-6 text-sm font-black text-white">
                Falar com a NexaWi <MessageCircle size={17} />
              </a>
            </div>
          </div>
          <div className="grid gap-3">
            {[
              ["Agenda", "Visão diária, semanal e status dos atendimentos."],
              ["Prontuário", "Histórico, anamnese, termos e fotos de evolução."],
              ["Financeiro", "Sinal, pacotes, pagamentos e comissões."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
                <h3 className="font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/62">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-black/10 bg-white px-5 py-8 text-sm text-neutral-500 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <LogoMark />
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos</Link>
            <Link href="/login-cliente">Entrar</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
