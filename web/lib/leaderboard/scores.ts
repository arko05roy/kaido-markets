/**
 * Calibration leaderboard — scores resolved scalar markets from on-chain Trade
 * events + position beliefs. No mock data: every row comes from RPC reads.
 */
import { distributionMarket } from "@kaido/contract-bindings";

import { getMarketEvents, type DecodedEvent } from "@/lib/indexer";
import { traderAddressString } from "@/lib/indexer/wallet-positions";
import { listMarketAddresses, getMarketState } from "@/lib/stellar/kaido";
import { deployedConfig } from "@/lib/stellar/contracts";
import { activeNetwork } from "@/lib/stellar/networks";

const WAD = BigInt("1000000000000000000");

export interface ForecasterScore {
  readonly address: string;
  /** Higher is better — sum of per-market calibration scores. */
  readonly calibration: number;
  readonly marketsScored: number;
  /** Longest run of non-negative per-market scores (by resolve time). */
  readonly streak: number;
}

/** Brier-like Gaussian score: -((x₀ − μ) / σ)² (dimensionless). */
export function calibrationPoint(muWad: bigint, sigmaWad: bigint, x0Wad: bigint): number {
  if (sigmaWad <= 0n) return 0;
  const num = Number(x0Wad - muWad) / Number(WAD);
  const den = Number(sigmaWad) / Number(WAD);
  const z = num / den;
  return -(z * z);
}

function resolvedX0FromEvents(events: DecodedEvent[]): bigint | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.name !== "Resolved") continue;
    const d = e.data as { x0?: unknown } | null;
    if (!d || d.x0 == null) continue;
    if (typeof d.x0 === "bigint") return d.x0;
    if (typeof d.x0 === "number") return BigInt(d.x0);
    if (typeof d.x0 === "string") return BigInt(d.x0);
  }
  return null;
}

async function beliefForPosition(
  marketId: string,
  positionId: string,
): Promise<{ muWad: bigint; sigmaWad: bigint } | null> {
  const net = activeNetwork();
  const c = new distributionMarket.Client({
    contractId: marketId,
    networkPassphrase: net.networkPassphrase,
    rpcUrl: net.rpcUrl!,
    allowHttp: net.rpcUrl!.startsWith("http://"),
  });
  try {
    const pos = (await c.get_position({ id: BigInt(positionId) })).result;
    return {
      muWad: BigInt(pos.after.mu),
      sigmaWad: BigInt(pos.after.sigma),
    };
  } catch {
    return null;
  }
}

/**
 * Build the calibration leaderboard from live registry + market RPC state.
 */
export async function buildCalibrationLeaderboard(limit = 50): Promise<ForecasterScore[]> {
  const markets = await listMarketAddresses();
  const perTrader = new Map<string, { total: number; count: number; streaks: number[] }>();

  for (const marketId of markets) {
    const { state, params } = await getMarketState(marketId);
    if (params.outcome_space.tag !== "Scalar") continue;
    if (state.status.tag !== "Resolved") continue;

    const events = await getMarketEvents(marketId, { limit: 500 });
    let x0: bigint | null =
      state.status.tag === "Resolved" ? BigInt(state.status.values[0]) : null;
    if (x0 == null) x0 = resolvedX0FromEvents(events);
    if (x0 == null) continue;

    const seen = new Set<string>();
    for (const e of events) {
      if (e.name !== "Trade") continue;
      const d = e.data as Record<string, unknown> | null;
      if (!d) continue;
      const trader = traderAddressString(d.trader);
      const idRaw = d.id;
      const id =
        typeof idRaw === "bigint"
          ? idRaw.toString()
          : typeof idRaw === "number"
            ? String(idRaw)
            : typeof idRaw === "string"
              ? idRaw
              : null;
      if (!trader || !id) continue;
      const key = `${trader}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const belief = await beliefForPosition(marketId, id);
      if (!belief) continue;
      const pt = calibrationPoint(belief.muWad, belief.sigmaWad, x0);
      const cur = perTrader.get(trader) ?? { total: 0, count: 0, streaks: [] };
      cur.total += pt;
      cur.count += 1;
      cur.streaks.push(pt);
      perTrader.set(trader, cur);
    }
  }

  const rows: ForecasterScore[] = [];
  for (const [address, { total, count, streaks }] of perTrader) {
    let streak = 0;
    let run = 0;
    for (const s of streaks) {
      if (s >= 0) {
        run += 1;
        streak = Math.max(streak, run);
      } else {
        run = 0;
      }
    }
    rows.push({
      address,
      calibration: total,
      marketsScored: count,
      streak,
    });
  }

  rows.sort((a, b) => b.calibration - a.calibration || b.marketsScored - a.marketsScored);
  return rows.slice(0, limit);
}

/** Short display id for a market (for debugging links). */
export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/** Expose registry id for pages that need it. */
export function registryContractId(): string {
  return deployedConfig().contracts.registry;
}
