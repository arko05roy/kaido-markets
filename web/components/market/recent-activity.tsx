/**
 * `RecentActivity` — a small server component that lists the most recent
 * decoded contract events for a market. Powered by `web/lib/indexer`
 * (RPC `getEvents`); rendered inline on the market page. Keeps the UI honest:
 * what's shown is what's on-chain.
 */
import { getMarketEvents, type DecodedEvent, type KaidoEventName } from "@/lib/indexer";

const PRETTY: Record<KaidoEventName, string> = {
  MarketCreated: "Market created",
  Trade: "Trade",
  TradeTrajectory: "Trajectory trade",
  LiquidityAdded: "Liquidity added",
  LiquidityRemoved: "Liquidity removed",
  Resolved: "Resolved",
  ResolvedTrajectory: "Resolved (trajectory)",
  MarketRegistered: "Registered",
  Seeded: "House seeded",
  Withdrawn: "House withdrew",
  Deposited: "Vault deposit",
  CapSet: "Cap set",
};

/** Human "100.0000000 USDC" from a 7-dp i128 carried as a JS `bigint`. */
function fmt7dp(raw: unknown): string | null {
  if (typeof raw !== "bigint") return null;
  const sign = raw < 0n ? "-" : "";
  const a = raw < 0n ? -raw : raw;
  const whole = a / 10_000_000n;
  const frac = (a % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${sign}${whole}${frac ? "." + frac : ""}`;
}

function fmt(e: DecodedEvent): string {
  if (!e.name) return "Event";
  return PRETTY[e.name];
}

/**
 * A short detail string for the event — best-effort, only the fields the
 * struct shape predictably carries (see `#[contractevent]` definitions in
 * `kaido-common`).
 */
function detail(e: DecodedEvent): string | null {
  const d = e.data;
  if (!d || typeof d !== "object") return null;
  const m = d as Record<string, unknown>;
  switch (e.name) {
    case "Trade":
    case "TradeTrajectory": {
      const c = fmt7dp(m.collateral);
      const fee = fmt7dp(m.fee);
      return c ? `${c} USDC${fee ? ` (fee ${fee})` : ""}` : null;
    }
    case "LiquidityAdded":
    case "LiquidityRemoved":
    case "Seeded":
    case "Withdrawn":
    case "Deposited": {
      const amt = fmt7dp(m.amount);
      return amt ? `${amt} USDC` : null;
    }
    case "CapSet": {
      const cap = fmt7dp(m.cap);
      return cap ? `cap ${cap} USDC` : null;
    }
    case "Resolved": {
      return typeof m.x0 === "bigint" ? `x₀ = ${m.x0.toString()}` : null;
    }
    default:
      return null;
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toUTCString().replace("GMT", "UTC") : iso;
}

export async function RecentActivity({ marketId }: { marketId: string }) {
  let events: DecodedEvent[] = [];
  let error: string | null = null;
  try {
    events = await getMarketEvents(marketId, { limit: 20 });
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read events";
  }

  if (error) {
    return (
      <p className="border border-dashed border-white/15 px-5 py-4 text-sm text-white/45">
        Couldn&apos;t read recent activity: {error}
      </p>
    );
  }
  if (events.length === 0) {
    return (
      <p className="border border-dashed border-white/15 px-5 py-4 text-sm text-white/45">
        No activity in the last day.
      </p>
    );
  }
  // RPC returns oldest-first; reverse for "most recent first".
  const ordered = [...events].reverse();
  return (
    <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1c1c21]">
      {ordered.map((e) => {
        const d = detail(e);
        return (
          <li key={e.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
            <span className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium text-[#f3efe6]">{fmt(e)}</span>
              {d ? <span className="text-white/45">{d}</span> : null}
            </span>
            <span className="font-mono text-xs text-white/35" title={e.txHash}>
              ledger {e.ledger} · {fmtTime(e.ledgerClosedAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
