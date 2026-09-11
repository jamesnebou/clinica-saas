"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "nexawi-dashboard-theme";

function applyTheme(theme) {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.dashboardTheme = theme;
  document.documentElement.style.colorScheme =
    theme === "dark" ? "dark" : "light";
}

export function DashboardThemeToggle() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    let initialTheme = "light";

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);

      if (saved === "dark" || saved === "light") {
        initialTheme = saved;
      }
    } catch {
      initialTheme = "light";
    }

    /*
     * Atualiza o DOM imediatamente,
     * mas agenda a atualização do estado
     * para não disparar setState síncrono dentro do effect.
     */
    applyTheme(initialTheme);

    const frame = window.requestAnimationFrame(() => {
      setTheme(initialTheme);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  function toggleTheme() {
    const nextTheme =
      theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    applyTheme(nextTheme);

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        nextTheme
      );
    } catch {
      // O tema continua funcionando mesmo
      // sem persistência no localStorage.
    }
  }

  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="dashboard-theme-toggle"
      aria-label={
        dark
          ? "Ativar modo claro"
          : "Ativar modo escuro"
      }
      title={
        dark
          ? "Ativar modo claro"
          : "Ativar modo escuro"
      }
    >
      <span className="dashboard-theme-toggle__orb">
        {dark ? (
          <Sun size={16} strokeWidth={2.2} />
        ) : (
          <Moon size={16} strokeWidth={2.2} />
        )}
      </span>

      <span className="dashboard-theme-toggle__label">
        {dark ? "Modo claro" : "Modo escuro"}
      </span>
    </button>
  );
}