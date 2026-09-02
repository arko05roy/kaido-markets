"use client";

import { type KaidoConfig } from "@kaido/sdk";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { MarketDetailHeader } from "@/components/market/market-detail-header";
import { MarketDetailClient } from "@/components/market/market-detail-client";
import { type TradeMarketView } from "@/components/forecast/trade-panel";
import { type SettlementMarketView } from "@/components/market/settlement-panel";
import { crowdTargetLabel, marketSubtitle } from "@/lib/market-display";
import type { MarketStats24h } from "@/lib/market-stats";
import { parseOutcomeConfig } from "@/lib/outcome-scale";
import type { MarketParams } from "@/lib/stellar/kaido";
import { type LiveCrowdSnapshot, useLiveCrowd } from "@/lib/use-live-crowd";

export function MarketLivePage({
  config,
  marketId,
  view,
  settlement,
  lpMarket,
  marketTitle,
  resolved,
  stats24h,
  detailRows,
  header,
}: {
  config: KaidoConfig;
  marketId: string;
  view: TradeMarketView;
  settlement: SettlementMarketView;
  lpMarket: { id: string; bWad: string; canAdd: boolean; canRemove: boolean };
  marketTitle: string;
  resolved?: string[];
  stats24h?: MarketStats24h;
  detailRows: { label: string; value: React.ReactNode }[];
  header: {
    status: string;
    closesAt: number;
    statusTag: string;
    blendBackedDepth7dp?: bigint;
    volumeUsdc?: number;
    crowdMovedPct?: number;
    params: MarketParams;
  };
}) {
  const router = useRouter();
  const initial: LiveCrowdSnapshot = useMemo(
    () => ({
      consensusMusWad: view.consensusMusWad,
      consensusSigmasWad: view.consensusSigmasWad,
    }),
    [view.consensusMusWad, view.consensusSigmasWad],
  );
  const { consensus, crowdMuWad, applyOptimistic, refresh } = useLiveCrowd(marketId, initial);

  const liveView: TradeMarketView = useMemo(
    () => ({
      ...view,
      consensusMusWad: consensus.consensusMusWad,
      consensusSigmasWad: consensus.consensusSigmasWad,
    }),
    [view, consensus],
  );

  const [positionRefresh, setPositionRefresh] = useState(0);

  const handlePositionOpened = useCallback(
    (next: LiveCrowdSnapshot) => {
      applyOptimistic(next);
      setPositionRefresh((n) => n + 1);
      void refresh();
      router.refresh();
    },
    [applyOptimistic, refresh, router],
  );

  const outcomeConfig = useMemo(
    () =>
      view.kind === "scalar"
        ? parseOutcomeConfig({
            marketStyle: view.marketStyle,
            outcomeMin: view.outcomeMin,
            outcomeMax: view.outcomeMax,
            divisions: view.divisions,
            divisionLabels: view.divisionLabels,
            optionLow: view.optionLow,
            optionHigh: view.optionHigh,
          })
        : null,
    [
      view.kind,
      view.marketStyle,
      view.outcomeMin,
      view.outcomeMax,
      view.divisions,
      view.divisionLabels,
      view.optionLow,
      view.optionHigh,
    ],
  );

  const liveSubtitle = marketSubtitle(header.params, crowdMuWad, outcomeConfig);

  return (
    <>
      <MarketDetailHeader
        title={marketTitle}
        subtitle={liveSubtitle}
        status={header.status}
        crowdTarget={crowdTargetLabel(crowdMuWad, outcomeConfig)}
        closesAt={header.closesAt}
        statusTag={header.statusTag}
        blendBackedDepth7dp={header.blendBackedDepth7dp}
        volumeUsdc={header.volumeUsdc}
        crowdMovedPct={header.crowdMovedPct}
      />
      <MarketDetailClient
        config={config}
        view={liveView}
        settlement={settlement}
        lpMarket={lpMarket}
        marketTitle={marketTitle}
        resolved={resolved}
        stats24h={stats24h}
        marketId={marketId}
        crowdMuWad={crowdMuWad}
        detailRows={detailRows}
        positionRefresh={positionRefresh}
        onPositionOpened={handlePositionOpened}
      />
    </>
  );
}
