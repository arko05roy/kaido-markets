import type { TradeMarketView } from "@/components/forecast/trade-panel";
import { isTradingWindowOpen } from "@/lib/market-display";
import type { MarketCard } from "@/lib/market-types";
import { checkpointsFromOutcomeSpace } from "@/lib/outcome-space";

export function tradeViewFromMarketCard(card: MarketCard, nowSec?: number): TradeMarketView {
  const isTraj = card.info.outcome_space.tag === "Trajectory";
  const mu = card.crowdMuWad?.toString() ?? "0";
  const sigma = card.crowdSigmaWad?.toString() ?? "0";
  const statusTag = card.status?.tag ?? "Open";
  return {
    address: card.address,
    kind: isTraj ? "trajectory" : "scalar",
    kWad: (card.kWad ?? 1n).toString(),
    bWad: (card.bWad ?? 1n).toString(),
    consensusMusWad: [mu],
    consensusSigmasWad: [sigma],
    checkpoints: checkpointsFromOutcomeSpace(card.info.outcome_space),
    statusTag,
    tradingOpen: isTradingWindowOpen(statusTag, card.info.window, nowSec),
    windowOpen: Number(card.info.window.open),
    windowLock: Number(card.info.window.lock),
    capped: card.info.capped,
  };
}
