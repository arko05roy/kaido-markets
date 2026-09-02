"use client";

/**
 * ConsensusChart — read-only render of a market's current consensus
 * distribution (the belief the AMM holds right now), plus the resolved value
 * once known. A thin client boundary that re-hydrates the string-encoded
 * `TradeMarketView` (RSC can't pass `bigint`) into a {@link BeliefChart}.
 */
import { useMemo } from "react";

import { BeliefChart } from "@/components/forecast/belief-chart";
import { fromWad, type GaussianBelief } from "@/lib/curve";

import type { TradeMarketView } from "@/components/forecast/trade-panel";

export function ConsensusChart({
  view,
  resolved,
  you,
}: {
  view: TradeMarketView;
  /** Resolved outcome(s) in WAD strings, once known: one for scalar, one per checkpoint. */
  resolved?: string[];
  you?: GaussianBelief;
}) {
  const kWad = useMemo(() => BigInt(view.kWad), [view.kWad]);
  const bWad = useMemo(() => BigInt(view.bWad), [view.bWad]);

  if (view.kind === "scalar") {
    const muWad = BigInt(view.consensusMusWad[0] ?? "0");
    const sigmaWad = BigInt(view.consensusSigmasWad[0] ?? "1");
    const muReal = fromWad(muWad);
    const sigmaReal = Math.max(1e-12, fromWad(sigmaWad));
    return (
      <BeliefChart
        mode="scalar"
        market={{ kWad, bWad, capped: view.capped }}
        range={{ min: muReal - 5 * sigmaReal, max: muReal + 5 * sigmaReal }}
        consensus={{ muWad, sigmaWad }}
        you={you}
        anchorYToConsensus
        resolved={resolved?.[0] != null ? fromWad(BigInt(resolved[0])) : undefined}
      />
    );
  }

  return (
    <BeliefChart
      mode="trajectory"
      market={{ kWad }}
      checkpoints={view.checkpoints}
      consensusMus={view.consensusMusWad.map((m) => fromWad(BigInt(m)))}
      resolved={resolved?.length ? resolved.map((r) => fromWad(BigInt(r))) : undefined}
    />
  );
}
