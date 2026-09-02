"use client";

import { type KaidoConfig } from "@kaido/sdk";
import { useMemo, useState } from "react";

import { AdvancedBlock } from "@/components/app/advanced-block";
import { tradingPhase } from "@/lib/market-display";
import { parseOutcomeConfig } from "@/lib/outcome-scale";
import { useLedgerNow } from "@/components/providers/ledger-time-provider";
import {
  MobileTradeBar,
  TradePanel,
  type TradeMarketView,
} from "@/components/forecast/trade-panel";
import { LpPanel, type LpMarketView } from "@/components/market/lp-panel";
import { SettlementPanel, type SettlementMarketView } from "@/components/market/settlement-panel";
import type { GaussianBelief } from "@/lib/curve";
import type { LiveCrowdSnapshot } from "@/lib/use-live-crowd";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function MarketActions({
  config,
  tradeMarket,
  settlementMarket,
  lpMarket,
  marketTitle,
  onBeliefChange,
  onPositionOpened,
}: {
  config: KaidoConfig;
  tradeMarket: TradeMarketView;
  settlementMarket: SettlementMarketView;
  lpMarket: LpMarketView;
  marketTitle?: string;
  onBeliefChange?: (belief: GaussianBelief) => void;
  onPositionOpened?: (consensus: LiveCrowdSnapshot) => void;
}) {
  const [positionRefresh, setPositionRefresh] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [call, setCall] = useState("—");
  const [multiple, setMultiple] = useState(1);

  const { nowSec } = useLedgerNow();
  const phase = tradingPhase(
    tradeMarket.statusTag,
    { open: tradeMarket.windowOpen, lock: tradeMarket.windowLock },
    nowSec,
  );
  const showTradeTicket = phase === "open" || phase === "before_open";
  const enrichedMarket: TradeMarketView = {
    ...tradeMarket,
    marketTitle: marketTitle ?? tradeMarket.marketTitle,
  };

  const outcomeConfig = useMemo(
    () =>
      tradeMarket.kind === "scalar"
        ? parseOutcomeConfig({
            marketStyle: tradeMarket.marketStyle,
            outcomeMin: tradeMarket.outcomeMin,
            outcomeMax: tradeMarket.outcomeMax,
            divisions: tradeMarket.divisions,
            divisionLabels: tradeMarket.divisionLabels,
            optionLow: tradeMarket.optionLow,
            optionHigh: tradeMarket.optionHigh,
          })
        : null,
    [tradeMarket],
  );

  const bumpPosition = (consensus: LiveCrowdSnapshot) => {
    setPositionRefresh((n) => n + 1);
    onPositionOpened?.(consensus);
  };

  return (
    <>
      <div className="space-y-6">
        {showTradeTicket && (
          <div className="hidden lg:block">
            <TradePanel
              config={config}
              market={enrichedMarket}
              onBeliefChange={onBeliefChange}
              onPreviewChange={(c, m) => {
                setCall(c);
                setMultiple(m);
              }}
              onPositionOpened={(id, consensus) => bumpPosition(consensus)}
            />
          </div>
        )}

        {!showTradeTicket && (
          <SettlementPanel
            config={config}
            market={settlementMarket}
            outcomeConfig={outcomeConfig}
            refreshKey={positionRefresh}
          />
        )}

        <AdvancedBlock title="Provide liquidity">
          <LpPanel config={config} market={lpMarket} />
        </AdvancedBlock>
      </div>

      {showTradeTicket && (
        <>
          <MobileTradeBar call={call} multiple={multiple} onOpen={() => setMobileOpen(true)} />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto border-white/10 bg-[#0a0a0b]">
              <SheetHeader>
                <SheetTitle className="font-serif text-[#f3efe6]">Place belief</SheetTitle>
              </SheetHeader>
              <div className="pb-8">
                <TradePanel
                  config={config}
                  market={enrichedMarket}
                  compact
                  onBeliefChange={onBeliefChange}
                  onPreviewChange={(c, m) => {
                    setCall(c);
                    setMultiple(m);
                  }}
                  onPositionOpened={(_id, consensus) => {
                    bumpPosition(consensus);
                    setMobileOpen(false);
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </>
  );
}
