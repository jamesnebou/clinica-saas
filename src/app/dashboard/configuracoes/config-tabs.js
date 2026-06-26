"use client";

import { Children, isValidElement, useState } from "react";
import { Clock, CreditCard, Globe2, MessageCircle, Palette, Quote, Settings } from "lucide-react";

const tabs = [
  { id: "dados", label: "Dados", icon: Settings },
  { id: "identidade", label: "Identidade", icon: Palette },
  { id: "site", label: "Site", icon: Globe2 },
  { id: "depoimentos", label: "Depoimentos", icon: Quote },
  { id: "expediente", label: "Expediente", icon: Clock },
  { id: "politicas", label: "Politicas", icon: MessageCircle },
  { id: "integracoes", label: "Integracoes", icon: CreditCard },
];

export function ConfigTabs({ children }) {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const panels = Children.toArray(children).filter(isValidElement);
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTab));

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-2" role="tablist" aria-label="Configuracoes da clinica">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-black transition ${
                  selected
                    ? "bg-[color-mix(in_srgb,var(--clinic-primary)_12%,white)] text-[var(--clinic-primary)] shadow-sm ring-1 ring-[color-mix(in_srgb,var(--clinic-primary)_24%,transparent)]"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {panels.map((panel, index) => (
        <div key={tabs[index]?.id || index} role="tabpanel" hidden={index !== activeIndex}>
          {panel}
        </div>
      ))}
    </div>
  );
}
