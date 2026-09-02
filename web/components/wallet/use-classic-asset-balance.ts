"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchClassicAssetBalance7dp, formatUsdcBalance } from "@/lib/stellar/usdc";

/** Horizon classic balance — matches Freighter for a specific code + issuer. */
export function useClassicAssetBalance(
  horizonUrl: string | undefined,
  assetCode: string | undefined,
  assetIssuer: string | undefined,
  accountId: string | undefined,
): {
  balance7dp: bigint | null;
  formatted: string | null;
  loading: boolean;
  refresh: () => void;
} {
  const [balance7dp, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!horizonUrl || !assetCode || !assetIssuer || !accountId) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchClassicAssetBalance7dp(horizonUrl, accountId, assetCode, assetIssuer)
      .then((b) => {
        if (!cancelled) setBalance(b);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [horizonUrl, assetCode, assetIssuer, accountId, tick]);

  return {
    balance7dp,
    formatted: balance7dp != null ? formatUsdcBalance(balance7dp) : null,
    loading,
    refresh,
  };
}
