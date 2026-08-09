"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function DemoSessionLifecycle() {
  const router = useRouter();
  const resettingRef = useRef(false);

  useEffect(() => {
    const resetDemo = async ({ refresh = false, keepalive = false } = {}) => {
      if (resettingRef.current) return;
      resettingRef.current = true;

      try {
        const response = await fetch("/api/demo/reset", {
          method: "POST",
          cache: "no-store",
          keepalive,
          headers: { "x-demo-reset": "1" },
        });

        if (refresh && response.ok) router.refresh();
      } catch {
        // O proximo login da conta demo tambem restaura a base protegida.
      } finally {
        resettingRef.current = false;
      }
    };

    const navigation = performance.getEntriesByType?.("navigation")?.[0];
    if (navigation?.type === "reload") {
      void resetDemo({ refresh: true });
    }

    const handlePageHide = () => {
      void resetDemo({ keepalive: true });
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [router]);

  return null;
}
