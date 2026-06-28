"use client";

import { useEffect } from "react";

export function PublicScrollEffects() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".public-card-reveal"));

    if (!elements.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle("is-visible", entry.isIntersecting);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);

  return null;
}
