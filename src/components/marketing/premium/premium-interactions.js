"use client";
import { useEffect, useRef, useState } from "react";
import { Menu, X, Check, ArrowRight } from "lucide-react";
import Image from "next/image";
import { trackMarketingEvent } from "../conversion-tracker";
import styles from "./premium.module.css";

export function PremiumMenu() {
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);
  return <div className={styles.mobileMenu} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); } }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={toggle} type="button" aria-label={open ? "Fechar menu" : "Abrir menu"} aria-expanded={open} aria-controls="premium-mobile-nav" onClick={() => setOpen(!open)}>{open ? <X size={21} /> : <Menu size={21} />}</button>
    <nav id="premium-mobile-nav" hidden={!open} aria-label="Navegação móvel">
      {[["#solucao", "Solução"], ["#recursos", "Recursos"], ["#planos", "Planos"], ["#faq", "FAQ"], ["/login-cliente", "Entrar"]].map(([href, label]) => <a href={href} key={href} onClick={() => setOpen(false)}>{label}<ArrowRight size={15} aria-hidden="true" /></a>)}
    </nav>
  </div>;
}

export function PremiumRoles({ roles }) {
  const [active, setActive] = useState(0);
  const refs = useRef([]);
  function changeByKey(event, index) {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % roles.length;
    else if (event.key === "ArrowLeft") next = (index + roles.length - 1) % roles.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = roles.length - 1;
    else return;
    event.preventDefault(); setActive(next); refs.current[next]?.focus();
  }
  return <section className={styles.roles}><div className={styles.container}>
    <div className={styles.rolesLayout}>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>A mesma operação, visões responsáveis</p>
        <h2>Cada função encontra o que precisa para trabalhar.</h2>
        <p className={styles.description}>Cada perfil acessa o que precisa para trabalhar com mais clareza, sem misturar responsabilidades.</p>
        <div className={styles.rolesVisual}>
          <Image src="/marketing/odontologia/roles-devices.png" alt="Notebook e celular exibindo o sistema NexaWi Clínicas" fill sizes="(max-width: 767px) 100vw, 50vw" />
        </div>
      </div>
      <div className={styles.rolesTool}>
        <div className={styles.roleTabs} role="tablist" aria-label="Visões por função">{roles.map((role, index) => <button key={role.title} type="button" ref={(el) => { refs.current[index] = el; }} role="tab" id={`role-tab-${index}`} aria-controls={`role-panel-${index}`} aria-selected={active === index} tabIndex={active === index ? 0 : -1} onKeyDown={(event) => changeByKey(event, index)} onClick={() => setActive(index)}>{role.title}</button>)}</div>
        {roles.map((role, index) => <div key={role.title} role="tabpanel" tabIndex={0} id={`role-panel-${index}`} aria-labelledby={`role-tab-${index}`} hidden={active !== index} className={styles.rolePanel}>
          <span className={styles.roleNumber}>0{index + 1}</span><h3>{role.description}</h3><ul>{role.items.map((item) => <li key={item}><Check size={18} aria-hidden="true" />{item}</li>)}</ul>
        </div>)}
      </div>
    </div>
  </div></section>;
}

export function PremiumFaqTelemetry({ segment }) {
  // The server-rendered FAQ stays static; this listener adds only anonymous interaction telemetry.
  useEffect(() => {
    const container = document.querySelector("[data-premium-faq-list]");
    if (!container) return undefined;
    const details = [...container.querySelectorAll("details")];
    const handlers = details.map((item) => {
      const handler = () => {
        if (item.open) trackMarketingEvent("faq_open", { segment, question: item.querySelector("summary")?.textContent?.trim().slice(0, 100) || "faq" });
      };
      item.addEventListener("toggle", handler);
      return [item, handler];
    });
    return () => handlers.forEach(([item, handler]) => item.removeEventListener("toggle", handler));
  }, [segment]);

  return null;
}
