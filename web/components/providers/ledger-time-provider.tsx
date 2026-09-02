"use client";

import { createContext, useContext } from "react";

import { type LedgerNow, useLedgerNowSec } from "@/lib/use-ledger-now";

const LedgerTimeContext = createContext<LedgerNow | null>(null);

export function LedgerTimeProvider({
  rpcUrl,
  initialSec,
  children,
}: {
  rpcUrl?: string | null;
  initialSec?: number | null;
  children: React.ReactNode;
}) {
  const value = useLedgerNowSec(rpcUrl, initialSec);
  return <LedgerTimeContext.Provider value={value}>{children}</LedgerTimeContext.Provider>;
}

/** Ledger-aligned clock for market windows — prefer over wall clock everywhere. */
export function useLedgerNow(): LedgerNow {
  const ctx = useContext(LedgerTimeContext);
  if (!ctx) {
    throw new Error("useLedgerNow must be used within LedgerTimeProvider");
  }
  return ctx;
}
