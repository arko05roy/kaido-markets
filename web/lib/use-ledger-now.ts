"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Seconds timestamp aligned to Stellar ledger time (what contracts use for windows).
 * Falls back to wall clock if RPC is unavailable.
 */
export function useLedgerNowSec(rpcUrl?: string | null): number {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const offsetRef = useRef(0);

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

  return nowSec;
}
