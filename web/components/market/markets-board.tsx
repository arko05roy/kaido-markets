"use client";

import { useMemo, useState } from "react";

import {
  MiniCrowdCurve,
} from "@/components/market/mini-crowd-curve";
import { ClosesIn } from "@/components/market/closes-in";
import {
  Panel,
  PrimaryLink,
  StatusPill,
} from "@/components/app/kaido-ui";
import {
  crowdTargetLabel,
  statusLabel,
} from "@/lib/market-display";
import { displayMarketQuestion } from "@/lib/market-metadata";
import type { SavedMarketMetadata } from "@/lib/market-metadata";
import type { MarketCard } from "@/lib/market-types";
import Link from "next/link";

export type MarketFilter = "all" | "hot" | "closing" | "new" | "wide";

function sortMarkets(markets: MarketCard[], filter: MarketFilter): MarketCard[] {
  const now = Math.floor(Date.now() / 1000);
  const copy = [...markets];
  switch (filter) {
    case "closing":
      return copy.sort(
        (a, b) => Number(a.info.window.lock) - Number(b.info.window.lock),
      );
    case "new":
      return copy.reverse();
    case "wide": {
      return copy.sort((a, b) => {
        const sa = a.crowdSigmaWad ? Number(a.crowdSigmaWad) : 0;
        const sb = b.crowdSigmaWad ? Number(b.crowdSigmaWad) : 0;
        return sb - sa;
      });
    }
    case "hot":
    case "all":
    default:
      return copy.sort((a, b) => {
        const openA = statusLabel(a.status) === "Open" ? 1 : 0;
        const openB = statusLabel(b.status) === "Open" ? 1 : 0;
        if (openB !== openA) return openB - openA;
        return Number(a.info.window.lock) - Number(b.info.window.lock);
      });
  }
}

const FILTERS: { id: MarketFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "hot", label: "Hot" },
  { id: "closing", label: "Closing soon" },
  { id: "wide", label: "Wide open" },
  { id: "new", label: "New" },
];

function MarketCardItem({
  card,
  metadata,
}: {
  card: MarketCard;
  metadata?: SavedMarketMetadata;
}) {
  const { address, info, status, crowdMuWad, crowdSigmaWad, kWad, bWad } = card;
  const statusText = statusLabel(status);
  const closesAt =
    Number(info.window.lock);
  const title = displayMarketQuestion(info, crowdMuWad, metadata?.question);
  const crowd =
    crowdMuWad != null ? crowdTargetLabel(crowdMuWad) : null;

  return (
    <Link href={`/markets/${address}`} className="group block">
      <Panel className="flex h-full flex-col gap-4 p-5 transition-colors hover:border-[#d8c69a]/35 hover:bg-[#0e0e10] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label={statusText} />
              {info.capped && (
                <span className="border border-[#d8c69a]/25 bg-[#d8c69a]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#d8c69a]">
                  Capped
                </span>
              )}
            </div>
            <h2 className="font-serif text-lg leading-snug tracking-tight text-[#f3efe6] sm:text-xl">
              {title}
            </h2>
            {crowd && (
              <p className="font-mono text-sm text-white/55">
                Crowd target: <span className="text-[#d8c69a]">{crowd}</span>
              </p>
            )}
          </div>
          {crowdMuWad != null && crowdSigmaWad != null && kWad != null && bWad != null && (
            <MiniCrowdCurve
              muWad={crowdMuWad}
              sigmaWad={crowdSigmaWad}
              kWad={kWad}
              bWad={bWad}
              capped={info.capped}
            />
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-white/8 pt-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            <span>
              Closes in <ClosesIn at={closesAt} />
            </span>
          </div>
          <span className="rounded-full border border-[#d8c69a]/30 bg-[#d8c69a]/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d8c69a] transition-colors group-hover:border-[#d8c69a]/50 group-hover:bg-[#d8c69a]/15">
            Trade range →
          </span>
        </div>
      </Panel>
    </Link>
  );
}

export function MarketsBoard({
  markets,
  openCount,
  metadataByMarket = {},
}: {
  markets: MarketCard[];
  openCount: number;
  metadataByMarket?: Record<string, SavedMarketMetadata>;
}) {
  const [filter, setFilter] = useState<MarketFilter>("all");
  const filtered = useMemo(() => sortMarkets(markets, filter), [markets, filter]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`min-h-10 rounded-full border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0c] ${
              filter === f.id
                ? "border-[#d8c69a]/50 bg-[#d8c69a]/15 text-[#d8c69a]"
                : "border-white/10 bg-transparent text-white/45 hover:border-white/20 hover:text-white/70"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-6 border-y border-white/10 py-5 font-mono text-[10px] uppercase tracking-[0.22em]">
        <div>
          <span className="text-white/35">Live </span>
          <span className="text-[#f3efe6]">{markets.length}</span>
        </div>
        <div>
          <span className="text-white/35">Open now </span>
          <span className="text-[#d8c69a]">{openCount}</span>
        </div>
        <div className="text-white/35">Call the number · fade the crowd</div>
      </div>

      {filtered.length === 0 ? (
        <Panel className="border-dashed px-8 py-12 text-center">
          <p className="text-sm text-white/50">No markets match this filter.</p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((card) => (
            <MarketCardItem key={card.address} card={card} metadata={metadataByMarket[card.address]} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MarketsEmpty({ action }: { action?: React.ReactNode }) {
  return (
    <Panel className="flex flex-col items-center gap-4 border-dashed px-8 py-16 text-center">
      <p className="font-serif text-2xl text-[#f3efe6]">No markets yet</p>
      <p className="max-w-md text-sm leading-relaxed text-white/50">
        Be the first to open a range market. Pick an outcome, set the oracle, seed the crowd curve.
      </p>
      {action ?? <PrimaryLink href="/create">Create a market</PrimaryLink>}
    </Panel>
  );
}
