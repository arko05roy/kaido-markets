"use client";

import { useEffect, useRef, useState } from "react";

export type LedgerNow = { nowSec: number; ledgerSynced: boolean };

/**
 * Seconds timestamp aligned to Stellar ledger time (what contracts use for windows).
 * Pass `initialSec` from SSR so the first paint matches on-chain clocks.
 */
export function useLedgerNowSec(
  rpcUrl?: string | null,
  initialSec?: number | null,
): LedgerNow {
  const [nowSec, setNowSec] = useState(() => initialSec ?? Math.floor(Date.now() / 1000));
  const [ledgerSynced, setLedgerSynced] = useState(initialSec != null);
  const offsetRef = useRef(
    initialSec != null ? initialSec - Math.floor(Date.now() / 1000) : 0,
  );

  useEffect(() => {
    if (initialSec != null) {
      offsetRef.current = initialSec - Math.floor(Date.now() / 1000);
      setNowSec(initialSec);
      setLedgerSynced(true);
    }
  }, [initialSec]);

  useEffect(() => {
    const id = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000) + offsetRef.current),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!rpcUrl) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const { rpc } = await import("@stellar/stellar-sdk");
        const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
        const latest = await server.getLatestLedger();
        const ledgerSec = Number(latest.closeTime);
        if (!cancelled && Number.isFinite(ledgerSec)) {
          offsetRef.current = ledgerSec - Math.floor(Date.now() / 1000);
          setNowSec(ledgerSec);
          setLedgerSynced(true);
        }
      } catch {
        // ponytail: wall clock fallback when RPC hiccups
      }
    };
    void sync();
    const id = setInterval(() => void sync(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [rpcUrl]);

  return { nowSec, ledgerSynced };
}
