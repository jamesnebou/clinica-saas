"use client";

import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { trackMarketingEvent } from "./conversion-tracker";
import { marketingSignupHref, pricingEventData } from "@/lib/marketing/commercial-links.mjs";

function rememberPlan(plan, segment, eventNames = ["pricing_click"]) {
  try {
    window.localStorage.setItem("nexawi_selected_plan", plan);
  } catch {}
  window.dispatchEvent(new CustomEvent("nexawi:plan-selected", { detail: plan }));
  eventNames.forEach((eventName) => trackMarketingEvent(eventName, pricingEventData(plan, segment)));
}

export function PlanCta({ plan, segment, featured = false, className }) {
  function choosePlan() {
    rememberPlan(plan, segment);
  }

  return (
    <a
      href={marketingSignupHref(plan, segment)}
      onClick={choosePlan}
      className={className || `mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-black transition hover:-translate-y-0.5 ${featured ? "bg-[var(--nexawi-primary)] text-white shadow-[0_18px_42px_var(--nexawi-primary-glow)]" : "bg-[#1c1c1c] text-white"}`}
    >
      Quero este plano <ArrowRight size={16} />
    </a>
  );
}

export function PlanContactCta({ plan, segment, className, eventNames = ["cta_click"] }) {
  function choosePlan() {
    rememberPlan(plan, segment, eventNames);
  }

  return <a href="#contato" onClick={choosePlan} className={className}>Falar sobre este plano</a>;
}

export function MarketingSectionView({ targetId, eventName, metadata }) {
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return undefined;
    let sent = false;
    const report = () => {
      if (sent) return;
      sent = true;
      trackMarketingEvent(eventName, metadata);
    };
    if (!window.IntersectionObserver) {
      report();
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        report();
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [eventName, metadata, targetId]);

  return null;
}
