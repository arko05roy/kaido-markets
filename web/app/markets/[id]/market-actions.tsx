"use client";

import { type KaidoConfig } from "@kaido/sdk";
import { useState } from "react";

import { AdvancedBlock } from "@/components/app/advanced-block";
import { isTradingWindowOpen } from "@/lib/market-display";
import { useLedgerNowSec } from "@/lib/use-ledger-now";
import {
  MobileTradeBar,
  TradePanel,
  type TradeMarketView,
} from "@/components/forecast/trade-panel";
import { LpPanel, type LpMarketView } from "@/components/market/lp-panel";
import { SettlementPanel, type SettlementMarketView } from "@/components/market/settlement-panel";
import type { GaussianBelief } from "@/lib/curve";
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
  onPositionOpened?: () => void;
}) {
  const [positionRefresh, setPositionRefresh] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [call, setCall] = useState("—");
  const [multiple, setMultiple] = useState(1);

  const nowSec = useLedgerNowSec(config.rpcUrl);
  const tradingOpen = isTradingWindowOpen(
    tradeMarket.statusTag,
    { open: tradeMarket.windowOpen, lock: tradeMarket.windowLock },
    nowSec,
  );
  const enrichedMarket: TradeMarketView = {
    ...tradeMarket,
    marketTitle: marketTitle ?? tradeMarket.marketTitle,
  };

  const bumpPosition = () => {
    setPositionRefresh((n) => n + 1);
    onPositionOpened?.();
  };

  return (
    <>
      <div className="space-y-6">
        {tradingOpen && (
          <div className="hidden lg:block">
            <TradePanel
              config={config}
              market={enrichedMarket}
              onBeliefChange={onBeliefChange}
              onPreviewChange={(c, m) => {
                setCall(c);
                setMultiple(m);
              }}
              onPositionOpened={() => bumpPosition()}
            />
          </div>
        )}

        {!tradingOpen && (
          <SettlementPanel
            config={config}
            market={settlementMarket}
            refreshKey={positionRefresh}
          />
        )}

        <AdvancedBlock title="Provide liquidity">
          <LpPanel config={config} market={lpMarket} />
        </AdvancedBlock>
      </div>

      {tradingOpen && (
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
                  onPositionOpened={() => {
                    bumpPosition();
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
