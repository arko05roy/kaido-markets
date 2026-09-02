/**
 * Discover a wallet's position ids on a market from on-chain `Trade` /
 * `TradeTrajectory` events (RPC `getEvents`). Merges with localStorage in the
 * settlement panel so claims work across browsers.
 */
import { rpc as StellarRpc, scValToNative } from "@stellar/stellar-sdk";

import type { DecodedEvent } from "@/lib/indexer";

export interface ChainPosition {
  readonly id: string;
  /** Collateral locked (WAD) if present on the event. */
  readonly collateralWad?: string;
  readonly openedAtLedger: number;
}

function decodeEvent(ev: StellarRpc.Api.EventResponse): DecodedEvent {
  let name: DecodedEvent["name"] = null;
  const topics: unknown[] = [];
  for (let i = 0; i < ev.topic.length; i++) {
    let value: unknown;
    try {
      value = scValToNative(ev.topic[i]);
    } catch {
      value = null;
    }
    if (i === 0 && typeof value === "string") {
      if (value === "Trade" || value === "TradeTrajectory") name = value;
    }
    topics.push(value);
  }
  let data: unknown;
  try {
    data = scValToNative(ev.value);
  } catch {
    data = null;
  }
  return {
    id: ev.id,
    ledger: ev.ledger,
    ledgerClosedAt: ev.ledgerClosedAt,
    txHash: ev.txHash,
    contractId: ev.contractId ? ev.contractId.toString() : "",
    name,
    topics,
    data,
  };
}

/** Normalize a Soroban-decoded trader address to a comparable string. */
export function traderAddressString(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.address === "string") return o.address;
    if (typeof o.value === "string") return o.value;
  }
  return null;
}

/** Extract position rows from decoded trade events for `wallet`. */
export function positionsFromEvents(events: DecodedEvent[], wallet: string): ChainPosition[] {
  const want = wallet.toUpperCase();
  const byId = new Map<string, ChainPosition>();
  for (const e of events) {
    if (e.name !== "Trade" && e.name !== "TradeTrajectory") continue;
    const d = e.data;
    if (!d || typeof d !== "object") continue;
    const m = d as Record<string, unknown>;
    const trader = traderAddressString(m.trader);
    if (!trader || trader.toUpperCase() !== want) continue;
    const idRaw = m.id;
    const id =
      typeof idRaw === "bigint"
        ? idRaw.toString()
        : typeof idRaw === "number"
          ? String(idRaw)
          : typeof idRaw === "string"
            ? idRaw
            : null;
    if (!id) continue;
    const collateral =
      typeof m.collateral === "bigint"
        ? m.collateral.toString()
        : typeof m.collateral === "string"
          ? m.collateral
          : undefined;
    const existing = byId.get(id);
    if (!existing || e.ledger > existing.openedAtLedger) {
      byId.set(id, { id, collateralWad: collateral, openedAtLedger: e.ledger });
    }
  }
  return [...byId.values()].sort((a, b) => b.openedAtLedger - a.openedAtLedger);
}

const LEDGERS_PER_DAY = 17_280;

/**
 * Fetch position ids opened by `wallet` on `marketId` via live RPC `getEvents`.
 */
export async function fetchWalletPositions(
  rpcUrl: string,
  marketId: string,
  wallet: string,
  opts: { startLedger?: number; limit?: number } = {},
): Promise<ChainPosition[]> {
  const server = new StellarRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  const startLedger =
    opts.startLedger ??
    Math.max(1, (await server.getLatestLedger()).sequence - LEDGERS_PER_DAY);
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 1000));
  const res = await server.getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds: [marketId] }],
    limit,
  });
  const decoded = res.events.map(decodeEvent);
  return positionsFromEvents(decoded, wallet);
}
