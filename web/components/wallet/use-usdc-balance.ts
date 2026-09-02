"use client";

import { useEffect, useState } from "react";

import { fetchUsdcBalance7dp, formatUsdcBalance } from "@/lib/stellar/usdc";

export function useUsdcBalance(
  rpcUrl: string | undefined,
  networkPassphrase: string,
  usdcSacId: string | undefined,
  accountId: string | undefined,
): { balance7dp: bigint | null; formatted: string | null; loading: boolean } {
  const [balance7dp, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rpcUrl || !usdcSacId || !accountId) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchUsdcBalance7dp(rpcUrl, networkPassphrase, usdcSacId, accountId)
      .then((b) => {
        if (!cancelled) setBalance(b);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rpcUrl, networkPassphrase, usdcSacId, accountId]);

  return {
    balance7dp,
    formatted: balance7dp != null ? formatUsdcBalance(balance7dp) : null,
    loading,
  };
}
