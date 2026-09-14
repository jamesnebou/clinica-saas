"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { LayoutDashboard, ChartNoAxesCombined, CalendarDays, Bell, MessageCircle, Users, ContactRound, Workflow, Stethoscope, Scissors, ShoppingBag, Package, UserRoundCog, Settings, Wallet, CreditCard, BookOpen, Maximize2, ChevronLeft, ChevronRight } from "lucide-react";
import { productShowcaseCategories, productShowcaseTabs, productTabsForCategory, nextProductTab } from "@/lib/marketing/product-showcase.mjs";
import { trackMarketingEvent } from "../conversion-tracker";
import styles from "./premium.module.css";

const icons = { LayoutDashboard, ChartNoAxesCombined, CalendarDays, Bell, MessageCircle, Users, ContactRound, Workflow, Stethoscope, Scissors, ShoppingBag, Package, UserRoundCog, Settings, Wallet, CreditCard, BookOpen };

function ProductScreenshot({ tab, fallbackImage }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? fallbackImage : tab.image;
  return <a className={styles.galleryImage} href={src} target="_blank" rel="noreferrer" aria-label={`Ampliar print: ${tab.label}`}>
    <Image src={src} alt={`NexaWi Clínicas: ${tab.label}`} fill sizes="(max-width: 1280px) 94vw, 1200px" onError={() => setFailed(true)} />
    <span className={styles.galleryZoom} title="Ampliar print"><Maximize2 size={18} aria-hidden="true" /></span>
  </a>;
}

export function PremiumProductGallery({ fallbackImage, segment }) {
  const [active, setActive] = useState(0);
  const [category, setCategory] = useState(productShowcaseTabs[0].category);
  const refs = useRef([]);
  const tab = productShowcaseTabs[active];
  const visibleTabs = productTabsForCategory(category);
  const visibleIndexes = visibleTabs.map((item) => productShowcaseTabs.findIndex((tabItem) => tabItem.id === item.id));
  function select(index, shouldTrack = true) {
    const nextTab = productShowcaseTabs[index];
    if (shouldTrack && nextTab) trackMarketingEvent("product_gallery_tab", { segment, category: nextTab.category, tab: nextTab.id });
    setActive(index);
    refs.current[index]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }
  function onKeyDown(event, index) {
    const localIndex = visibleIndexes.indexOf(index);
    const nextLocal = nextProductTab(event.key, localIndex, visibleIndexes.length);
    const next = nextLocal === null ? null : visibleIndexes[nextLocal];
    if (next === null) return;
    event.preventDefault();
    select(next);
    refs.current[next]?.focus({ preventScroll: true });
  }
  function selectCategory(nextCategory) {
    setCategory(nextCategory);
    const first = productTabsForCategory(nextCategory)[0];
    if (first) {
      select(productShowcaseTabs.findIndex((item) => item.id === first.id));
    }
  }
  function step(direction) {
    const position = visibleIndexes.indexOf(active);
    select(visibleIndexes[(position + direction + visibleIndexes.length) % visibleIndexes.length]);
  }
  return <div className={styles.gallery}>
    <div className={styles.galleryCategories} aria-label="Categorias de telas do sistema">
      {productShowcaseCategories.map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => selectCategory(item.id)}>{item.label}</button>)}
    </div>
    <div role="tablist" aria-label={`Telas de ${productShowcaseCategories.find((item) => item.id === category)?.label || "produto"}`} className={styles.galleryTabs}>
      {visibleIndexes.map((index) => {
        const item = productShowcaseTabs[index];
        const Icon = icons[item.icon];
        return <button key={item.id} type="button" role="tab" ref={(el) => { refs.current[index] = el; }}
          id={`product-tab-${item.id}`} aria-controls={`product-panel-${item.id}`} aria-selected={active === index}
          tabIndex={active === index ? 0 : -1} onClick={() => select(index)} onKeyDown={(event) => onKeyDown(event, index)}>
          <Icon size={17} aria-hidden="true" /><span>{item.label}</span>
        </button>;
      })}
    </div>
    {productShowcaseTabs.map((item, index) => <div key={item.id} id={`product-panel-${item.id}`} role="tabpanel"
      aria-labelledby={`product-tab-${item.id}`} hidden={active !== index} tabIndex={0}>
      {active === index && <figure className={styles.galleryFrame}>
        <div className={styles.browserBar}><span className={styles.browserDots} aria-hidden="true"><i /><i /><i /></span><span>NexaWi Clínicas / {tab.label}</span><span>{String(active + 1).padStart(2, "0")} / {productShowcaseTabs.length}</span></div>
        <ProductScreenshot key={tab.id} tab={tab} fallbackImage={fallbackImage} />
        <figcaption><span>{tab.label} · Demonstração do produto</span><span className={styles.galleryControls}><button type="button" onClick={() => step(-1)} aria-label="Tela anterior"><ChevronLeft size={17} /></button><button type="button" onClick={() => step(1)} aria-label="Próxima tela"><ChevronRight size={17} /></button></span></figcaption>
      </figure>}
    </div>)}
  </div>;
}
