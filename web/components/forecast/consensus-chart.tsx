"use client";

import { useMemo } from "react";

import { BinaryOddsBar } from "@/components/forecast/binary-odds-bar";
import { BeliefChart } from "@/components/forecast/belief-chart";
import { fromWad, type GaussianBelief } from "@/lib/curve";
import { chartRangeForConfig, formatXTick, parseOutcomeConfig, tickLabelItems, chartHeightForTickCount } from "@/lib/outcome-scale";

import type { TradeMarketView } from "@/components/forecast/trade-panel";

export function ConsensusChart({
  view,
  resolved,
  you,
}: {
  view: TradeMarketView;
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
    const outcomeConfig = parseOutcomeConfig({
      marketStyle: view.marketStyle,
      outcomeMin: view.outcomeMin,
      outcomeMax: view.outcomeMax,
      divisions: view.divisions,
      divisionLabels: view.divisionLabels,
      optionLow: view.optionLow,
      optionHigh: view.optionHigh,
    });

    if (outcomeConfig?.style === "binary") {
      const youMu = you != null ? fromWad(you.muWad) : undefined;
      const resolvedVal = resolved?.[0] != null ? fromWad(BigInt(resolved[0])) : undefined;
      return (
        <div className="space-y-6">
          <BinaryOddsBar
            config={outcomeConfig}
            value={muReal}
            resolved={resolvedVal}
            size="lg"
          />
          {youMu != null && Number.isFinite(youMu) && Math.abs(youMu - muReal) > 0.5 && (
            <div className="border-t border-white/[0.06] pt-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                Your position
              </p>
              <BinaryOddsBar config={outcomeConfig} value={youMu} crowdValue={muReal} size="md" />
            </div>
          )}
        </div>
      );
    }

    const range = chartRangeForConfig(outcomeConfig, muReal, sigmaReal);
    const tickN = outcomeConfig?.divisions?.length ?? 0;
    return (
      <BeliefChart
        mode="scalar"
        flat
        height={chartHeightForTickCount(tickN)}
        market={{ kWad, bWad, capped: view.capped }}
        range={range}
        xTicks={outcomeConfig?.divisions}
        xAxisItems={outcomeConfig ? tickLabelItems(outcomeConfig) : undefined}
        formatXTick={outcomeConfig ? (v) => formatXTick(outcomeConfig, v) : undefined}
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
