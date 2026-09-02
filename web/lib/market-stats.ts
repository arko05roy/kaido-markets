import type { DecodedEvent } from "@/lib/indexer";
import { fromWad } from "@/lib/curve";
import { traderAddressString } from "@/lib/indexer/wallet-positions";

export interface MarketStats24h {
  volumeUsdc: number | null;
  traderCount: number | null;
  crowdMovedPct: number | null;
}

const DAY_MS = 86_400_000;

function tradeCollateralUsdc(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const collateral = (data as Record<string, unknown>).collateral;
  if (typeof collateral !== "bigint") return null;
  return fromWad(collateral);
}

function beliefMuWad(data: unknown): bigint | null {
  if (!data || typeof data !== "object") return null;
  const belief = (data as Record<string, unknown>).belief;
  if (!belief || typeof belief !== "object") return null;
  const mu = (belief as Record<string, unknown>).mu;
  return typeof mu === "bigint" ? mu : null;
}

/** Aggregate 24h trade stats from decoded market events. */
export function aggregateMarketStats24h(events: DecodedEvent[]): MarketStats24h {
  const cutoff = Date.now() - DAY_MS;
  const trades = events.filter((e) => {
    if (e.name !== "Trade" && e.name !== "TradeTrajectory") return false;
    const t = new Date(e.ledgerClosedAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });

  if (trades.length === 0) {
    return { volumeUsdc: null, traderCount: null, crowdMovedPct: null };
  }

  let volume = 0;
  const traders = new Set<string>();
  const mus: bigint[] = [];

  for (const e of trades) {
    const c = tradeCollateralUsdc(e.data);
    if (c != null) volume += c;
    const d = e.data;
    if (d && typeof d === "object") {
      const trader = traderAddressString((d as Record<string, unknown>).trader);
      if (trader) traders.add(trader.toUpperCase());
    }
    const mu = beliefMuWad(e.data);
    if (mu != null) mus.push(mu);
  }

  let crowdMovedPct: number | null = null;
  if (mus.length >= 2) {
    const first = fromWad(mus[0]);
    const last = fromWad(mus[mus.length - 1]);
    if (Math.abs(first) > 1e-12) {
      crowdMovedPct = ((last - first) / Math.abs(first)) * 100;
    }
  }

  return {
    volumeUsdc: volume > 0 ? volume : null,
    traderCount: traders.size > 0 ? traders.size : null,
    crowdMovedPct,
  };
}
