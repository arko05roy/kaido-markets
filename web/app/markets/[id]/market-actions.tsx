"use client";

import { type KaidoConfig } from "@kaido/sdk";
import { useState } from "react";

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

  return (
    <div className="space-y-6">
      <TradePanel
        config={config}
        market={tradeMarket}
        onPositionOpened={() => setPositionRefresh((n) => n + 1)}
      />
      <LpPanel config={config} market={lpMarket} />
      <SettlementPanel config={config} market={settlementMarket} refreshKey={positionRefresh} />
    </div>
  );
}
