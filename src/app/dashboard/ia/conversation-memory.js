"use client";

import { createContext, useContext, useEffect, useMemo } from "react";

const ConversationMemoryContext = createContext(null);
const MAX_MESSAGES = 12;
const IDLE_MS = 20 * 60 * 1000;

export function createScopedConversationMemory(scopeKey, clock = {}) {
  const now = clock.now || Date.now;
  const schedule = clock.schedule || setTimeout;
  const cancel = clock.cancel || clearTimeout;
  let entry = null;
  let timer = null;
  let onExpire = null;

  function clear() {
    if (timer !== null) cancel(timer);
    timer = null;
    entry = null;
  }

  return {
    save(snapshot) {
      clear();
      entry = { scopeKey, expiresAt: now() + IDLE_MS, snapshot: {
        ...snapshot,
        messages: snapshot.messages.slice(-MAX_MESSAGES),
      } };
      timer = schedule(() => {
        clear();
        onExpire?.();
      }, IDLE_MS);
    },
    read() {
      if (!entry || entry.scopeKey !== scopeKey || now() >= entry.expiresAt) {
        clear();
        return null;
      }
      return entry.snapshot;
    },
    clear,
    subscribe(listener) {
      onExpire = listener;
      return () => { if (onExpire === listener) onExpire = null; };
    },
  };
}

export function ClinicAiConversationProvider({ scopeKey, children }) {
  const store = useMemo(() => createScopedConversationMemory(scopeKey), [scopeKey]);
  useEffect(() => () => store.clear(), [store]);
  return <ConversationMemoryContext.Provider value={store}>{children}</ConversationMemoryContext.Provider>;
}

export function useClinicAiConversationMemory() {
  const memory = useContext(ConversationMemoryContext);
  if (!memory) throw new Error("Clinic AI conversation provider is missing");
  return memory;
}
