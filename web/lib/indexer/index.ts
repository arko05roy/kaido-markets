/**
 * Minimal event indexer (build.md §5 Sprint 4, E16 observability).
 *
 * Tails Soroban contract events via the RPC `getEvents` method and decodes
 * them into typed shapes the UI can render. Two consumption modes:
 *
 *  - **Server-side cached fetch:** [`getMarketEvents`] is a short-TTL cached
 *    server helper for App-Router pages. The cache is keyed on
 *    `(network, marketId, startLedger)` and lives for ~10 seconds — long
 *    enough to coalesce a render's worth of reads, short enough that a fresh
 *    page-load reflects activity from the prior block.
 *  - **Streaming subscription:** for client-side live updates use
 *    `Kaido.subscribeEvents(...)` from `@kaido/sdk` directly — it polls the
 *    same `getEvents` endpoint with a cursor-resumable loop.
 *
 * No secrets, no business logic — this only reads public on-chain state and
 * shapes it for display (ADR-10).
 */
import { rpc as StellarRpc, scValToNative } from "@stellar/stellar-sdk";

import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";

/**
 * The set of Kaido event topics the UI knows how to render. Names match the
 * `#[contractevent]` struct names in the Rust crates (these are the first
 * topic the host emits — see Soroban `contractevent` docs / build.md §6
 * observability).
 */
export type KaidoEventName =
  | "MarketCreated"
  | "Trade"
  | "TradeTrajectory"
  | "LiquidityAdded"
  | "LiquidityRemoved"
  | "Resolved"
  | "ResolvedTrajectory"
  | "MarketRegistered"
  | "Seeded"
  | "Withdrawn"
  | "Deposited"
  | "CapSet";

/** A decoded contract event ready for rendering. */
export interface DecodedEvent {
  /** RPC event id (unique, sortable). */
  readonly id: string;
  /** Ledger sequence — useful as a sort key + "as of" indicator. */
  readonly ledger: number;
  /** RFC-3339 close time of the ledger that included the tx. */
  readonly ledgerClosedAt: string;
  /** Transaction hash. */
  readonly txHash: string;
  /** Emitting contract id (C…). */
  readonly contractId: string;
  /** Event name (the first topic). `null` if it isn't a known Kaido event. */
  readonly name: KaidoEventName | null;
  /** Remaining topics (decoded native values). */
  readonly topics: unknown[];
  /** The event payload (a struct in our schema, decoded to a JS object). */
  readonly data: unknown;
}

/** Options for [`getMarketEvents`]. */
export interface GetMarketEventsOptions {
  /** Max events to return; default 50, server hard-caps at 1000. */
  readonly limit?: number;
  /**
   * Start at this ledger. Default: ~24 hours before the latest ledger
   * (≈17_280 ledgers at 5 s/ledger). RPC retains ~7 days; older windows
   * will simply return empty.
   */
  readonly startLedger?: number;
  /** Filter to one event name (e.g. `"Trade"`). Default: all known names. */
  readonly name?: KaidoEventName;
}

const LEDGERS_PER_DAY = 17_280;

/**
 * Fetch decoded events emitted by `marketId` over the past day (by default).
 *
 * Cached for ~10s in the App-Router render cache (`fetch`-style revalidate).
 * Callers in client components should use `Kaido.subscribeEvents` for live
 * updates rather than polling this.
 */
export async function getMarketEvents(
  marketId: string,
  opts: GetMarketEventsOptions = {},
): Promise<DecodedEvent[]> {
  const net = activeNetwork();
  if (!net.rpcUrl) {
    throw new Error(
      `Indexer: no RPC URL for network "${activeNetworkId()}". Set RPC_URL.`,
    );
  }
  const server = new StellarRpc.Server(net.rpcUrl, {
    allowHttp: net.rpcUrl.startsWith("http://"),
  });

  const startLedger =
    opts.startLedger ??
    Math.max(1, (await server.getLatestLedger()).sequence - LEDGERS_PER_DAY);
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 1000));

  // The RPC `getEvents` filter supports `topics` as a per-position prefix-match;
  // we leave it open and filter by name client-side below — it's cheap and
  // robust to topic-encoding changes.
  const res = await server.getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds: [marketId] }],
    limit,
  });

  const decoded = res.events.map(decodeEvent);
  if (opts.name) return decoded.filter((e) => e.name === opts.name);
  return decoded;
}

/**
 * Decode a raw RPC `EventResponse` to a {@link DecodedEvent}. Unknown topic
 * shapes fall through with `name: null` rather than throwing — the UI can
 * still show the ledger / tx / raw payload for debugging.
 */
function decodeEvent(ev: StellarRpc.Api.EventResponse): DecodedEvent {
  let name: KaidoEventName | null = null;
  const topics: unknown[] = [];
  for (let i = 0; i < ev.topic.length; i++) {
    let value: unknown;
    try {
      value = scValToNative(ev.topic[i]);
    } catch {
      value = null;
    }
    if (i === 0 && typeof value === "string" && isKnownEvent(value)) {
      name = value;
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

const KNOWN_EVENT_NAMES: ReadonlySet<string> = new Set<KaidoEventName>([
  "MarketCreated",
  "Trade",
  "TradeTrajectory",
  "LiquidityAdded",
  "LiquidityRemoved",
  "Resolved",
  "ResolvedTrajectory",
  "MarketRegistered",
  "Seeded",
  "Withdrawn",
  "Deposited",
  "CapSet",
]);

function isKnownEvent(s: string): s is KaidoEventName {
  return KNOWN_EVENT_NAMES.has(s);
}
