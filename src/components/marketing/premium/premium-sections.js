import Image from "next/image";
import { ArrowRight, Check, CalendarDays, UsersRound, ClipboardCheck, WalletCards, Globe2, Workflow, BarChart3, ShieldCheck, Clock3, MessageCircle } from "lucide-react";
import styles from "./premium.module.css";

const moduleIcons = { calendar: CalendarDays, users: UsersRound, clipboard: ClipboardCheck, wallet: WalletCards, globe: Globe2, workflow: Workflow, chart: BarChart3, shield: ShieldCheck };

export function PremiumProblems({ config }) {
  return <section id="solucao" className={styles.problems}><div className={styles.container}>
    <div className={styles.heading}><p className={styles.eyebrow}>O problema não é falta de esforço</p>
      <h2>Uma clínica pode atender muito e, ainda assim, perder controle, tempo e receita.</h2>
      <p className={styles.description}>Quando agenda, atendimento, relacionamento e financeiro ficam separados, a operação depende de conferência manual, perde contexto e cresce com mais atrito do que clareza.</p>
    </div>
    <div className={styles.painGrid}>{config.pains.map((pain, index) => <article key={pain.title} className={styles.pain}>
      <span className={styles.number}>0{index + 1}</span><h3>{pain.title}</h3><p>{pain.description}</p><p className={styles.impact}><strong>Impacto:</strong> {pain.impact}</p>
    </article>)}</div>
    <p className={styles.closing}>A NexaWi organiza essa operação em um único fluxo, sem tirar a identidade da sua clínica.</p>
  </div></section>;
}

export function PremiumTransformation({ config }) {
  return <section className={styles.transformation}><div className={styles.container}>
    <div className={styles.heading}><p className={styles.eyebrow}>Mudança operacional</p><h2>{config.transformation.title}</h2><p className={styles.description}>{config.transformation.description}</p></div>
    {config.transformation.image && <div className={styles.transformationImage}><Image src={config.transformation.image} alt={config.transformation.imageAlt} fill sizes="(max-width: 768px) 100vw, 720px" /></div>}
    <div className={styles.comparisons}>{config.transformation.comparisons.map(([before, after], index) => <article className={styles.comparison} key={before}>
      <span className={styles.comparisonNumber}>0{index + 1}</span>
      <div><span className={styles.beforeLabel}>Antes</span><p>{before}</p></div>
      <ArrowRight size={20} className={styles.comparisonArrow} aria-hidden="true" />
      <div className={styles.after}><span>Com a NexaWi</span><p><Check size={18} aria-hidden="true" />{after}</p></div>
    </article>)}</div>
    <p className={styles.closing}>A equipe ganha contexto. A gestão ganha clareza. O paciente percebe mais organização em cada etapa.</p>
  </div></section>;
}

export function PremiumJourney({ config }) {
  return <section className={styles.journey}><div className={styles.container}>
    <div className={styles.heading}><p className={styles.eyebrow}>Do primeiro contato ao retorno</p><h2>Uma jornada. Nenhuma etapa isolada.</h2></div>
    <ol className={styles.timeline}>{config.workflow.map((step, index) => <li key={step.label}>
      <span className={styles.stepNumber}>0{index + 1}</span><h3>{step.label}</h3><p>{step.description}</p>
    </li>)}</ol>
    <p className={styles.journeyClosing}>Cada etapa preserva contexto para a próxima — sem depender de planilhas, mensagens soltas ou conferência manual.</p>
  </div></section>;
}

export function PremiumModules({ config }) {
  return <section id="recursos" className={styles.section}><div className={styles.container}>
    <div className={styles.heading}><p className={styles.eyebrow}>Uma plataforma conectada</p><h2>Quatro pilares para sustentar a rotina. Tudo ao redor, conectado.</h2></div>
    <div className={styles.pillars}>{config.modules.slice(0, 4).map((module, index) => {
      const Icon = moduleIcons[module.icon];
      return <article key={module.title}><div className={styles.pillarTop}><Icon size={26} aria-hidden="true" /><span>0{index + 1}</span></div><h3>{module.title}</h3><p>{module.description}</p></article>;
    })}</div>
    <div className={styles.connectedModules}>{config.modules.slice(4).map((module) => {
      const Icon = moduleIcons[module.icon];
      return <article key={module.title}><Icon size={20} aria-hidden="true" /><h3>{module.title}</h3><p>{module.description}</p></article>;
    })}</div>
  </div></section>;
}

export function PremiumAutomation() {
  const items = [
    { icon: Clock3, title: "Esperas e tarefas", description: "O motor executa regras operacionais configuradas pela clínica, enquanto a equipe continua no controle das decisões e exceções." },
    { icon: MessageCircle, title: "Comunicação conectada", description: "Notificações e WhatsApp apoiam confirmações e acompanhamento, conforme as regras da clínica." },
    { icon: BarChart3, title: "Origem comercial", description: "A origem dos contatos e oportunidades permanece registrada para que a clínica acompanhe quais canais geram demanda e continuidade comercial." },
  ];
  return <section className={styles.automation}><div className={styles.container}>
    <div className={styles.automationLayout}>
      <div className={styles.heading}><p className={styles.eyebrow}>Automação com contexto</p><h2>A tecnologia acompanha o processo sem tomar decisões clínicas.</h2><p className={styles.description}>O motor trabalha sobre eventos operacionais. A equipe continua no controle das regras publicadas.</p>
        <div className={styles.automationItems}>{items.map(({ icon: Icon, title, description }) => <article key={title}><Icon size={20} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></article>)}</div>
      </div>
      <div className={styles.flowPanel}><p className={styles.flowLabel}>Fluxo operacional</p><ol className={styles.flow}>{["Evento", "Condição", "Espera", "Tarefa / comunicação", "Histórico"].map((label, index) => <li key={label}><span>0{index + 1}</span>{label}{index === 4 && <Check size={17} aria-hidden="true" />}</li>)}</ol><p className={styles.flowNote}>Regras configuradas pela clínica. Execuções com histórico.</p></div>
    </div>
  </div></section>;
}
