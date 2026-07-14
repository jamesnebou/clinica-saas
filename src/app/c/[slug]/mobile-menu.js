"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

export function PublicMobileMenu({ lojinhaAtiva = false }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <div className="public-floating-menu lg:hidden">
      <button
        type="button"
        className="public-floating-menu-button"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>

      {open ? (
        <div className="public-floating-menu-layer" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar menu" onClick={close} />
          <nav className="public-floating-menu-panel" aria-label="Menu do site">
            <a href="#sobre" onClick={close}>Sobre</a>
            <a href="#servicos" onClick={close}>Serviços</a>
            {lojinhaAtiva ? <a href="#loja" onClick={close}>Lojinha</a> : null}
            <a href="#depoimentos" onClick={close}>Depoimentos</a>
            <a href="#localizacao" onClick={close}>Localização</a>
            <a href="popup" onClick={close}>Quero saber mais</a>
            <a href="/login-cliente" onClick={close}>Área da clínica</a>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
