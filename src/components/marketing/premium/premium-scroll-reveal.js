"use client";
import { useEffect } from "react";
import { mountScrollReveal } from "@/lib/marketing/scroll-reveal.mjs";
import styles from "./premium.module.css";

const groups = [
  { selector: `.${styles.heading}`, direction: "up" },
  { selector: `.${styles.pain}`, direction: "up" },
  { selector: `.${styles.comparison}`, direction: "alternate" },
  { selector: `.${styles.timeline} > li`, direction: "up" },
  { selector: `.${styles.gallery}`, direction: "up" },
  { selector: `.${styles.pillars} > article`, direction: "alternate" },
  { selector: `.${styles.connectedModules} > article`, direction: "up" },
  { selector: `.${styles.rolesTool}, .${styles.flowPanel}`, direction: "right" },
  { selector: `.${styles.plan}, .${styles.featuredPlan}`, direction: "up" },
  { selector: `.${styles.comparisonTableWrap}, .${styles.mobilePlanComparison}`, direction: "up" },
  { selector: `.${styles.trustGrid} > article, .${styles.faqList} > details`, direction: "up" },
  { selector: ".premium-lead-intro", direction: "left" },
  { selector: ".premium-lead-form", direction: "right" },
];

export function PremiumScrollReveal() {
  useEffect(() => mountScrollReveal(document.querySelector('[data-marketing-variant="premium-v2"]'), groups), []);
  return null;
}
