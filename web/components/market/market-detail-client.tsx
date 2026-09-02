"use client";

import { type KaidoConfig } from "@kaido/sdk";
import { useMemo, useState } from "react";

import { useLedgerNow } from "@/components/providers/ledger-time-provider";

import { AdvancedBlock } from "@/components/app/advanced-block";
import { Panel } from "@/components/app/kaido-ui";
import { ConsensusChart } from "@/components/forecast/consensus-chart";
import { type TradeMarketView } from "@/components/forecast/trade-panel";
import { ChartCommentary } from "@/components/market/chart-commentary";
import { MarketActivityFeed } from "@/components/market/market-activity-feed";
import { MarketCardStats } from "@/components/market/market-card-stats";
import { MarketPositionsTab } from "@/components/market/market-positions-tab";
import { MarketTradingLayout } from "@/components/market/market-trading-layout";
import { PayoffZoneLabels } from "@/components/market/payoff-zone-labels";
import { StaleMarketBanner } from "@/components/market/stale-market-banner";
import { type SettlementMarketView } from "@/components/market/settlement-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GaussianBelief } from "@/lib/curve";
import type { MarketStats24h } from "@/lib/market-stats";
import { isTradingWindowStale } from "@/lib/market-display";
import type { LiveCrowdSnapshot } from "@/lib/use-live-crowd";
import { parseOutcomeConfig } from "@/lib/outcome-scale";
import { cn } from "@/lib/utils";

import { MarketActions } from "@/app/markets/[id]/market-actions";
import { OutcomeAxisPanel } from "@/components/market/outcome-axis-panel";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] py-3 last:border-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">{label}</dt>
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
  positionRefresh,
  onPositionOpened,
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
  positionRefresh: number;
  onPositionOpened: (consensus: LiveCrowdSnapshot) => void;
}) {
  const [yourBelief, setYourBelief] = useState<GaussianBelief | null>(null);
  const { nowSec, ledgerSynced } = useLedgerNow();

  const staleDeepLink =
    ledgerSynced &&
    isTradingWindowStale(view.statusTag, { open: view.windowOpen, lock: view.windowLock }, nowSec);

  const enrichedView: TradeMarketView = useMemo(
    () => ({ ...view, marketTitle }),
    [view, marketTitle],
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

  return (
    <div className="space-y-6">
      <StaleMarketBanner show={staleDeepLink} />

      <Tabs defaultValue="trade" className="gap-5">
        <TabsList className="w-full max-w-none border border-white/[0.04] bg-[#141416]/70">
          <TabsTrigger value="trade" className="flex-1 px-4 py-2.5">
            Trade
          </TabsTrigger>
          <TabsTrigger value="positions" className="flex-1 px-4 py-2.5">
            Positions
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-1 px-4 py-2.5">
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trade" className="mt-0">
          <MarketTradingLayout
            chartLabel="Payoff zone · crowd target"
            chart={
              <Panel
                className={cn(
                  "relative overflow-hidden border-[#d8c69a]/12 p-0",
                  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
                )}
              >
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[3px] bg-[#d8c69a]/45"
                />
                <div className="space-y-4 p-4 sm:p-6">
                  <ChartCommentary
                    crowdMuWad={crowdMuWad}
                    yourBelief={yourBelief}
                    outcomeConfig={outcomeConfig}
                  />
                  <ConsensusChart
                    view={view}
                    resolved={resolved}
                    you={yourBelief ?? undefined}
                  />
                  {view.kind === "scalar" && <PayoffZoneLabels />}
                </div>
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
                onPositionOpened={onPositionOpened}
              />
            }
          />
        </TabsContent>

        <TabsContent value="positions" className="mt-0">
          <MarketPositionsTab
            config={config}
            marketId={marketId}
            refreshKey={positionRefresh}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-0">
          <MarketActivityFeed marketId={marketId} />
        </TabsContent>
      </Tabs>

      <AdvancedBlock title="On-chain details">
        {view.kind === "scalar" &&
          view.marketStyle === "kaido" &&
          view.outcomeMin != null &&
          view.outcomeMax != null &&
          view.divisions &&
          view.divisions.length >= 2 && (
            <div className="mb-5">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                Chart axis
              </p>
              <OutcomeAxisPanel
                marketId={marketId}
                question={marketTitle}
                outcomeMin={view.outcomeMin}
                outcomeMax={view.outcomeMax}
                divisions={view.divisions}
                divisionLabels={view.divisionLabels}
              />
            </div>
          )}
        <Panel className="border-0 bg-transparent p-0 shadow-none">
          <dl>
            {detailRows.map((r) => (
              <DetailRow key={r.label} label={r.label} value={r.value} />
            ))}
          </dl>
        </Panel>
        {stats24h && (
          <div className="mt-4">
            <MarketCardStats stats={stats24h} variant="chips" />
          </div>
        )}
      </AdvancedBlock>
    </div>
  );
}
