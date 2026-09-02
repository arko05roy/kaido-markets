"use client";

import { type KaidoConfig } from "@kaido/sdk";
import { useMemo, useState } from "react";

import { AdvancedBlock } from "@/components/app/advanced-block";
import { Panel } from "@/components/app/kaido-ui";
import { ConsensusChart } from "@/components/forecast/consensus-chart";
import { type TradeMarketView } from "@/components/forecast/trade-panel";
import { ChartCommentary } from "@/components/market/chart-commentary";
import { MarketActivityFeed } from "@/components/market/market-activity-feed";
import { MarketPositionsTab } from "@/components/market/market-positions-tab";
import { MarketTradingLayout } from "@/components/market/market-trading-layout";
import { PayoffZoneLabels } from "@/components/market/payoff-zone-labels";
import { StaleMarketBanner } from "@/components/market/stale-market-banner";
import { type SettlementMarketView } from "@/components/market/settlement-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GaussianBelief } from "@/lib/curve";
import type { MarketStats24h } from "@/lib/market-stats";
import { isTradingWindowOpen } from "@/lib/market-display";

import { MarketActions } from "@/app/markets/[id]/market-actions";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] py-2.5 last:border-0">
      <dt className="text-xs text-white/40">{label}</dt>
      <dd className="text-right text-sm text-[#f3efe6]">{value}</dd>
    </div>
  );
}

export function MarketDetailClient({
  config,
  view,
  settlement,
  lpMarket,
  marketTitle,
  resolved,
  stats24h,
  marketId,
  detailRows,
  crowdMuWad,
}: {
  config: KaidoConfig;
  view: TradeMarketView;
  settlement: SettlementMarketView;
  lpMarket: { id: string; bWad: string; canAdd: boolean; canRemove: boolean };
  marketTitle: string;
  resolved?: string[];
  stats24h?: MarketStats24h;
  marketId: string;
  crowdMuWad: bigint;
  detailRows: { label: string; value: React.ReactNode }[];
}) {
  const [yourBelief, setYourBelief] = useState<GaussianBelief | null>(null);
  const [positionRefresh, setPositionRefresh] = useState(0);
  const [nowSec] = useState(() => Math.floor(Date.now() / 1000));

  const tradingOpen = isTradingWindowOpen(
    view.statusTag,
    { open: view.windowOpen, lock: view.windowLock },
    nowSec,
  );
  const staleDeepLink = !tradingOpen && view.statusTag === "Open";

  const enrichedView: TradeMarketView = useMemo(
    () => ({ ...view, marketTitle }),
    [view, marketTitle],
  );

  return (
    <div className="space-y-5">
      <StaleMarketBanner show={staleDeepLink} />

      <Tabs defaultValue="trade">
        <TabsList className="w-full max-w-md">
          <TabsTrigger value="trade">Trade</TabsTrigger>
          <TabsTrigger value="positions">Your positions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="trade" className="mt-5">
          <MarketTradingLayout
            chartLabel="Payoff zone · crowd target"
            chart={
              <Panel className="space-y-3 p-4 sm:p-5">
                <ChartCommentary crowdMuWad={crowdMuWad} yourBelief={yourBelief} />
                <ConsensusChart
                  view={view}
                  resolved={resolved}
                  you={yourBelief ?? undefined}
                />
                {view.kind === "scalar" && <PayoffZoneLabels />}
              </Panel>
            }
            ticket={
              <MarketActions
                config={config}
                tradeMarket={enrichedView}
                settlementMarket={settlement}
                lpMarket={lpMarket}
                marketTitle={marketTitle}
                onBeliefChange={setYourBelief}
                onPositionOpened={() => setPositionRefresh((n) => n + 1)}
              />
            }
          />
        </TabsContent>

        <TabsContent value="positions" className="mt-5">
          <MarketPositionsTab
            config={config}
            marketId={marketId}
            refreshKey={positionRefresh}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-5">
          <MarketActivityFeed marketId={marketId} />
        </TabsContent>
      </Tabs>

      <AdvancedBlock title="Market details">
        <Panel className="px-4">
          <dl>
            {detailRows.map((r) => (
              <DetailRow key={r.label} label={r.label} value={r.value} />
            ))}
          </dl>
        </Panel>
        {stats24h && (stats24h.volumeUsdc != null || stats24h.crowdMovedPct != null) && (
          <p className="mt-3 font-mono text-[10px] text-white/35">
            {stats24h.volumeUsdc != null && `24h vol $${stats24h.volumeUsdc.toFixed(0)}`}
            {stats24h.crowdMovedPct != null &&
              ` · Crowd moved ${stats24h.crowdMovedPct >= 0 ? "+" : ""}${stats24h.crowdMovedPct.toFixed(1)}%`}
          </p>
        )}
      </AdvancedBlock>
    </div>
  );
}
