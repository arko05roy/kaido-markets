"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Panel } from "@/components/app/kaido-ui";
import { useWallet } from "@/components/wallet/provider";
import { fetchWalletPositions } from "@/lib/indexer/wallet-positions";
import {
  convictionFromSigma,
  convictionLabel,
  formatOutcome,
  formatUsdc7dp,
} from "@/lib/market-display";
import { fromWad } from "@/lib/curve";
import { loadPositions, type SavedPosition } from "@/lib/positions";
import type { KaidoConfig } from "@kaido/sdk";

export function MarketPositionsTab({
  config,
  marketId,
  refreshKey = 0,
}: {
  config: KaidoConfig;
  marketId: string;
  refreshKey?: number;
}) {
  const { wallet } = useWallet();
  const [chainIds, setChainIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const loadChain = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const rows = await fetchWalletPositions(config.rpcUrl, marketId, wallet.accountId);
      setChainIds(rows.map((r) => r.id));
    } finally {
      setLoading(false);
    }
  }, [wallet, config.rpcUrl, marketId]);

  useEffect(() => {
    void loadChain();
  }, [loadChain, refreshKey]);

  const positions = useMemo(() => {
    if (!wallet) return [];
    const local = loadPositions(config.network, wallet.accountId, marketId);
    const byId = new Map<string, SavedPosition>();
    for (const id of chainIds) {
      if (!byId.has(id)) byId.set(id, { id, openedAt: 0 });
    }
    for (const p of local) {
      const cur = byId.get(p.id);
      byId.set(p.id, cur ? { ...cur, ...p } : p);
    }
    return [...byId.values()].sort((a, b) => b.openedAt - a.openedAt);
  }, [wallet, config.network, marketId, chainIds, refreshKey]);

  if (!wallet) {
    return <p className="text-sm text-white/45">Connect Freighter to see your positions on this market.</p>;
  }

  if (loading && positions.length === 0) {
    return <p className="text-sm text-white/40">Loading positions…</p>;
  }

  if (positions.length === 0) {
    return <p className="text-sm text-white/45">No beliefs on this market yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {positions.map((p) => {
        const mu = p.muWad != null ? fromWad(BigInt(p.muWad)) : null;
        const sigma = p.sigmaWad != null ? fromWad(BigInt(p.sigmaWad)) : null;
        const conviction =
          sigma != null
            ? convictionLabel(convictionFromSigma(sigma, 1e-6, sigma * 16))
            : "—";
        const risk = p.collateral7dp ? formatUsdc7dp(BigInt(p.collateral7dp)) : "—";
        const claimed = p.claimedAt != null;

        return (
          <li key={p.id}>
            <Panel className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                  #{p.id}
                  {claimed ? " · Claimed" : " · Open"}
                </p>
                <p className="mt-1 text-[#f3efe6]">
                  {mu != null ? `Call ${formatOutcome(mu)}` : "Belief"} · {conviction}
                </p>
                <p className="text-xs text-white/45">Risk {risk} USDC</p>
              </div>
              {claimed && p.payout7dp && (
                <span className="font-mono text-emerald-300/90">
                  +{formatUsdc7dp(BigInt(p.payout7dp))} USDC
                </span>
              )}
            </Panel>
          </li>
        );
      })}
    </ul>
  );
}
