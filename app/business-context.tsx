"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type BusinessGroupContext = { id: number; name: string; accountId: number | null };
export type BusinessAccountContext = {
  accountId: number;
  accountCode: string;
  accountName: string;
  platformName: string;
  platformCode: string;
  groupId: number | null;
  groupName: string | null;
};

const STORAGE_KEY = "orbit-business-context";
const EVENT_NAME = "orbit-business-context-changed";
type ContextValue = { context: BusinessAccountContext | null; setContext: (value: BusinessAccountContext | null) => void; requestSwitch: () => void };
const BusinessContext = createContext<ContextValue>({ context: null, setContext: () => undefined, requestSwitch: () => undefined });

export function readBusinessContext(): BusinessAccountContext | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as BusinessAccountContext : null;
  } catch { return null; }
}

export function BusinessContextProvider({ children }: { children: ReactNode }) {
  const [context, setContextState] = useState<BusinessAccountContext | null>(null);
  useEffect(() => {
    const read = () => setContextState(readBusinessContext());
    read();
    window.addEventListener(EVENT_NAME, read);
    return () => window.removeEventListener(EVENT_NAME, read);
  }, []);
  const value = useMemo<ContextValue>(() => ({
    context,
    setContext(next) {
      setContextState(next);
      if (next) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.sessionStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event(EVENT_NAME));
    },
    requestSwitch() { window.dispatchEvent(new Event("orbit-request-business-context")); },
  }), [context]);
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusinessContext() { return useContext(BusinessContext); }

export function clearBusinessContext() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(EVENT_NAME));
}
