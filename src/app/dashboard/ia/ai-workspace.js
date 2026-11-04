"use client";

import { useState } from "react";
import { MessageCircle, Sparkles } from "lucide-react";
import { ClinicChatPanel } from "./chat-panel";
import { ClinicSummaryPanel } from "./summary-panel";

export function AiWorkspace({ scopeKey }) {
  const [tab, setTab] = useState("chat");
  return (
    <div className="mt-7">
      <div role="tablist" aria-label="NexaWi IA" className="flex gap-5 border-b border-neutral-200">
        <button role="tab" type="button" aria-selected={tab === "chat"} aria-controls="ai-chat-panel" onClick={() => setTab("chat")}
          className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm font-semibold ${tab === "chat" ? "border-[var(--clinic-primary)] text-neutral-950" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}>
          <MessageCircle size={17} /> Conversar
        </button>
        <button role="tab" type="button" aria-selected={tab === "summary"} aria-controls="ai-summary-panel" onClick={() => setTab("summary")}
          className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm font-semibold ${tab === "summary" ? "border-[var(--clinic-primary)] text-neutral-950" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}>
          <Sparkles size={17} /> Resumo inteligente
        </button>
      </div>
      <div id="ai-chat-panel" role="tabpanel" hidden={tab !== "chat"}><ClinicChatPanel scopeKey={scopeKey} /></div>
      {tab === "summary" ? <div id="ai-summary-panel" role="tabpanel"><ClinicSummaryPanel scopeKey={scopeKey} /></div> : null}
    </div>
  );
}
