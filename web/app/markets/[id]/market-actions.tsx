"use client";

import { type KaidoConfig } from "@kaido/sdk";
import { useState } from "react";

import { AdvancedBlock } from "@/components/app/advanced-block";
import { TradePanel, type TradeMarketView } from "@/components/forecast/trade-panel";
import { LpPanel, type LpMarketView } from "@/components/market/lp-panel";
import { SettlementPanel, type SettlementMarketView } from "@/components/market/settlement-panel";

export function MarketActions({
  config,
  tradeMarket,
  settlementMarket,
  lpMarket,
}: {
  config: KaidoConfig;
  tradeMarket: TradeMarketView;
  settlementMarket: SettlementMarketView;
  lpMarket: LpMarketView;
}) {
  const [positionRefresh, setPositionRefresh] = useState(0);
  const tradingOpen = tradeMarket.tradingOpen;

  return (
    <div className="space-y-6">
      {tradingOpen && (
        <TradePanel
          config={config}
          market={tradeMarket}
          onPositionOpened={() => setPositionRefresh((n) => n + 1)}
        />
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
  );
}
