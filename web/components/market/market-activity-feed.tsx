"use client";

import { useEffect, useState } from "react";

import { Panel } from "@/components/app/kaido-ui";
import type { DecodedEvent } from "@/lib/indexer";

const PRETTY: Record<string, string> = {
  Trade: "Trade",
  TradeTrajectory: "Trajectory trade",
  LiquidityAdded: "Liquidity added",
  LiquidityRemoved: "Liquidity removed",
  Resolved: "Resolved",
  ResolvedTrajectory: "Resolved (trajectory)",
  Seeded: "House seeded",
};

function fmt7dp(raw: unknown): string | null {
  if (typeof raw !== "bigint") return null;
  const whole = raw / 10_000_000n;
  const frac = (raw % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}${frac ? "." + frac : ""}`;
}

function detail(e: DecodedEvent): string | null {
  const d = e.data;
  if (!d || typeof d !== "object") return null;
  const m = d as Record<string, unknown>;
  if (e.name === "Trade" || e.name === "TradeTrajectory") {
    const c = fmt7dp(m.collateral);
    return c ? `${c} USDC` : null;
  }
  return null;
}

export function MarketActivityFeed({ marketId }: { marketId: string }) {
  const [events, setEvents] = useState<DecodedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/markets/${marketId}/events`)
      .then((r) => r.json())
      .then((body: { events?: DecodedEvent[]; error?: string }) => {
        if (cancelled) return;
        if (body.error) setError(body.error);
        else setEvents(body.events ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  if (loading) {
    return <p className="text-sm text-white/40">Loading activity…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-300">{error}</p>;
  }
  if (events.length === 0) {
    return <p className="text-sm text-white/40">No on-chain activity in the last 24h.</p>;
  }

  return (
    <Panel className="divide-y divide-white/[0.06]">
      {events
        .filter((e) => e.name)
        .slice(0, 25)
        .map((e) => (
          <div key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#d8c69a]">
              {e.name ? (PRETTY[e.name] ?? e.name) : "Event"}
            </span>
            <span className="text-white/45">{detail(e) ?? e.txHash.slice(0, 10) + "…"}</span>
            <span className="w-full font-mono text-[10px] text-white/30">
              {new Date(e.ledgerClosedAt).toLocaleString()}
            </span>
          </div>
        ))}
    </Panel>
  );
}
