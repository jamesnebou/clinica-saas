"use client";

import { useEffect } from "react";
import { trackMarketingEvent } from "./conversion-tracker";

export function SignupCompletionTracker({ enabled = false, plan = "starter" }) {
  useEffect(() => {
    if (!enabled) return;
    try {
      if (window.localStorage.getItem("nexawi_signup_completed_tracked") === "1") return;
      window.localStorage.setItem("nexawi_signup_completed_tracked", "1");
    } catch {}
    trackMarketingEvent("signup_completed", { method: "email", plan });
  }, [enabled, plan]);
  return null;
}
