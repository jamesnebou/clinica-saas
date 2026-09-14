import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ShieldCheck, ExternalLink } from "lucide-react";
import { MarketingTracking } from "../marketing-tracking";
import { LeadCaptureForm } from "../lead-capture-form";
import { MarketingSectionView, PlanContactCta, PlanCta } from "../plan-cta";
import { TrackedLink } from "../tracked-link";
import { PremiumFaqTelemetry, PremiumMenu, PremiumRoles } from "./premium-interactions";
import { PremiumProductGallery } from "./premium-product-gallery";
import { PremiumPlanComparison } from "./premium-plan-comparison";
import { PremiumScrollReveal } from "./premium-scroll-reveal";
import { PremiumProblems, PremiumTransformation, PremiumJourney, PremiumModules, PremiumAutomation } from "./premium-sections";
import styles from "./premium.module.css";

export function PremiumHeading({ eyebrow, title, description, id }) {
  return <div className={styles.heading}>
    <p className={styles.eyebrow}>{eyebrow}</p>
    <h2 id={id}>{title}</h2>
    {description && <p className={styles.description}>{description}</p>}
  </div>;
}

function PremiumHeader({ segment }) {
  return <header className={styles.header}>
    <div className={styles.headerInner}>
      <Link href="/" aria-label="NexaWi Clínicas, página inicial" className={styles.brand}>
        <span>NexaWi <small>Clínicas</small></span>
      </Link>
      <nav className={styles.desktopNav} aria-label="Navegação principal">
        <a href="#solucao">Solução</a><a href="#recursos">Recursos</a><a href="#planos">Planos</a><a href="#faq">FAQ</a>
      </nav>
      <div className={styles.headerActions}>
        <Link href="/login-cliente" className={styles.login}>Entrar</Link>
        <TrackedLink href="#contato" eventName="cta_click" eventData={{ location: "header", segment }} className={styles.button}>
          <span className={styles.desktopCta}>Falar com especialista</span><span className={styles.mobileCta}>Falar</span><ArrowRight size={16} aria-hidden="true" />
        </TrackedLink>
        <PremiumMenu />
      </div>
    </div>
  </header>;
}

function PremiumHero({ config }) {
  return <section className={styles.hero} aria-labelledby="odonto-title">
    <Image src={config.hero.image} alt={config.hero.imageAlt} fill priority sizes="100vw" className={styles.heroImage} />
    <div className={styles.heroShade} />
    <div className={styles.heroInner}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{config.hero.eyebrow}</p>
        <h1 id="odonto-title">{config.hero.title}</h1>
        {config.hero.statement ? <p className={styles.heroStatement}>{config.hero.statement}</p> : null}
        <p className={styles.heroDescription}>{config.hero.description}</p>
        <div className={styles.actions}>
          <TrackedLink href={config.hero.primaryCta.href} eventName="hero_primary_cta_click" eventData={{ location: "hero_primary", segment: config.slug }} className={styles.button}>
            {config.hero.primaryCta.label}<ArrowRight size={18} aria-hidden="true" />
          </TrackedLink>
          <TrackedLink href={config.hero.secondaryCta.href} prefetch={false} eventName="demo_click" eventData={{ location: "hero_secondary", segment: config.slug }} className={styles.outlineButton}>
            {config.hero.secondaryCta.label}<ExternalLink size={16} aria-hidden="true" />
          </TrackedLink>
        </div>
        <p className={styles.heroNote}><ShieldCheck size={16} aria-hidden="true" /> Demonstração com dados fictícios. Sem dados de pacientes reais.</p>
      </div>
    </div>
    <ul className={styles.heroPoints}>{config.hero.points.map((point) => <li key={point}><Check size={17} aria-hidden="true" />{point}</li>)}</ul>
  </section>;
}

function PremiumProduct({ config }) {
  return <section className={styles.product} aria-labelledby="product-title">
    <div className={styles.container}>
      <div className={styles.productHeading}>
        <PremiumHeading id="product-title" eyebrow="Por dentro da NexaWi" title="Veja a operação acontecendo dentro da NexaWi." description="Explore o mesmo ambiente da plataforma e veja, na prática, como agenda, CRM, prontuário, financeiro, BI e automações trabalham em uma única operação. A demonstração utiliza apenas dados fictícios." />
        <TrackedLink href="/demo" prefetch={false} eventName="demo_click" eventData={{ location: "product_showcase", segment: config.slug }} className={styles.textLink}>
          Explorar a demonstração<ArrowRight size={18} aria-hidden="true" />
        </TrackedLink>
      </div>
      <PremiumProductGallery fallbackImage="/clinic-dashboard-preview.png" segment={config.slug} />
    </div>
  </section>;
}

function PremiumPlans({ config, plans }) {
  return <section id="planos" className={styles.section}>
    <MarketingSectionView targetId="planos" eventName="pricing_view" metadata={{ segment: config.slug }} />
    <div className={styles.container}>
      <PremiumHeading eyebrow="Planos para cada momento" title="A estrutura certa para a sua próxima etapa." description="Escolha a capacidade que acompanha o tamanho da sua equipe e o volume da sua operação." />
      <div className={styles.planGrid}>{plans.map((plan) => <article key={plan.slug} className={plan.highlight ? styles.featuredPlan : styles.plan}>
        <div className={styles.planTop}><h3>{plan.name}</h3>{plan.badge ? <span>{plan.badge}</span> : null}</div>
        <p className={styles.planDescription}>{plan.description}</p>
        <p className={styles.price}>{plan.price}<span>/mês</span></p>
        <ul>{plan.limits.map((limit) => <li key={limit}><Check size={17} aria-hidden="true" />{limit}</li>)}</ul>
        <p className={styles.planSummary}>{plan.summary}</p>
        <PlanCta plan={plan.slug} segment={config.slug} featured={plan.highlight} className={styles.planCta} />
        <PlanContactCta plan={plan.slug} segment={config.slug} className={styles.planConversationCta} />
      </article>)}</div>
      <p className={styles.pricingNote}>Todos os planos usam a mesma base NexaWi. A capacidade e os recursos evoluem conforme a operação cresce.</p>
    </div>
  </section>;
}

function PremiumTrust() {
  return <section className={styles.trust}>
    <div className={styles.container}>
      <PremiumHeading eyebrow="Confiança faz parte da operação" title="A informação certa, para a pessoa certa." description="A NexaWi organiza acessos e responsabilidades sem misturar áreas, clínicas ou funções." />
      <div className={styles.trustGrid}>
        <article><ShieldCheck size={24} aria-hidden="true" /><h3>Separação por clínica</h3><p>Dados operacionais associados à sua clínica e protegidos pelas políticas de acesso do sistema.</p></article>
        <article><h3>Papéis e permissões</h3><p>Gestão, recepção, financeiro e profissionais trabalham com responsabilidades e acessos diferentes.</p></article>
        <article><h3>Privacidade e LGPD como parte da arquitetura</h3><p>Recursos de consentimento, controle de acesso e exclusão apoiam a clínica na gestão responsável dos dados.</p></article>
      </div>
    </div>
  </section>;
}

function PremiumFaq({ config }) {
  return <section id="faq" className={styles.section}>
    <PremiumFaqTelemetry segment={config.slug} />
    <div className={styles.faqLayout}>
      <PremiumHeading eyebrow="Antes de decidir" title="Suas perguntas. Respostas claras." description="Operação, pagamentos e implantação: entenda como a NexaWi se encaixa na rotina." />
      <div className={styles.faqList} data-premium-faq-list>{config.faqs.map(([question, answer]) => <details key={question}>
        <summary>{question}<ChevronDown size={18} aria-hidden="true" /></summary><p>{answer}</p>
      </details>)}</div>
    </div>
  </section>;
}

export function PremiumSegmentLandingPage({ config, plans }) {
  return <div className={styles.page} data-marketing-variant="premium-v2">
    <PremiumScrollReveal />
    <a className={styles.skipLink} href="#odonto-content">Pular para o conteúdo</a>
    <MarketingTracking segment={config.slug} pageType="segment_landing" contentName={`NexaWi Clínicas para ${config.name}`} />
    <PremiumHeader segment={config.slug} />
    <main id="odonto-content">
      <PremiumHero config={config} />
      <PremiumProblems config={config} />
      <PremiumTransformation config={config} />
      <PremiumJourney config={config} />
      <PremiumProduct config={config} />
      <PremiumModules config={config} />
      <PremiumRoles roles={config.roles} />
      <PremiumAutomation />
      <PremiumPlans config={config} plans={plans} />
      <PremiumPlanComparison plans={plans} segment={config.slug} />
      <PremiumTrust />
      <PremiumFaq config={config} />
      <div className={styles.contact}>
        <LeadCaptureForm segment={config.slug} variant="premium-v2" title={config.contact.title} description={config.contact.description} clinicPlaceholder={config.contact.clinicPlaceholder} />
      </div>
    </main>
    <footer className={styles.footer}><div className={styles.container}>
      <Link href="/" className={styles.footerBrand}>NexaWi <span>Clínicas</span></Link>
      <nav aria-label="Informações legais"><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link></nav>
    </div></footer>
  </div>;
}
