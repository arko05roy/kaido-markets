"use client";

import { useMemo, useState } from "react";

import {
  MiniCrowdCurve,
} from "@/components/market/mini-crowd-curve";
import { ClosesIn } from "@/components/market/closes-in";
import {
  DashboardPageHeader,
  MetricChip,
} from "@/components/app/dashboard-page-header";
import {
  Panel,
  PrimaryLink,
  StatusPill,
} from "@/components/app/kaido-ui";
import {
  crowdTargetLabel,
  formatUsdc7dp,
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

function MarketsBoardHeader({
  network,
  marketsCount,
  openCount,
  filter,
  onFilterChange,
  filteredCount,
  showFilters = true,
}: {
  network: string;
  marketsCount: number;
  openCount: number;
  filter: MarketFilter;
  onFilterChange: (f: MarketFilter) => void;
  filteredCount: number;
  showFilters?: boolean;
}) {
  return (
    <DashboardPageHeader
      title="Markets"
      description="Range beliefs on-chain — pick your zone, press conviction, trade the crowd."
      network={network}
      trailing={
        <>
          <MetricChip label="Listed" value={marketsCount} />
          <MetricChip label="Open" value={openCount} accent />
        </>
      }
      footer={
        showFilters ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-[#141416]/60 p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onFilterChange(f.id)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c21] ${
                    filter === f.id
                      ? "bg-[#2a2a30] font-medium text-[#f3efe6] shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
                      : "text-white/45 hover:text-white/70"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {filteredCount !== marketsCount && (
              <p className="shrink-0 font-mono text-[11px] text-white/35">
                Showing {filteredCount} of {marketsCount}
              </p>
            )}
          </div>
        ) : undefined
      }
    />
  );
}

function MarketCardItem({
  card,
  metadata,
}: {
  card: MarketCard;
  metadata?: SavedMarketMetadata;
}) {
  const { address, info, status, crowdMuWad, crowdSigmaWad, kWad, bWad, blendBackedDepth7dp } = card;
  const statusText = statusLabel(status);
  const closesAt =
    Number(info.window.lock);
  const title = displayMarketQuestion(info, crowdMuWad, metadata?.question);
  const crowd =
    crowdMuWad != null ? crowdTargetLabel(crowdMuWad) : null;

  return (
    <Link href={`/markets/${address}`} className="group block">
      <Panel className="flex h-full flex-col gap-4 p-5 transition-[border-color,background-color] duration-200 hover:border-[#d8c69a]/25 hover:bg-[#222228] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label={statusText} />
              {info.capped && (
                <span className="rounded-md border border-[#d8c69a]/25 bg-[#d8c69a]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#d8c69a]">
                  Capped
                </span>
              )}
              {blendBackedDepth7dp != null && blendBackedDepth7dp > 0n && (
                <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300/90">
                  Blend · {formatUsdc7dp(blendBackedDepth7dp)} USDC
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

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-white/[0.06] pt-4">
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
  network,
  metadataByMarket = {},
}: {
  markets: MarketCard[];
  openCount: number;
  network: string;
  metadataByMarket?: Record<string, SavedMarketMetadata>;
}) {
  const [filter, setFilter] = useState<MarketFilter>("all");
  const filtered = useMemo(() => sortMarkets(markets, filter), [markets, filter]);

  if (markets.length === 0) {
    return (
      <div className="space-y-5">
        <MarketsBoardHeader
          network={network}
          marketsCount={0}
          openCount={0}
          filter={filter}
          onFilterChange={setFilter}
          filteredCount={0}
          showFilters={false}
        />
        <MarketsEmpty />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <MarketsBoardHeader
        network={network}
        marketsCount={markets.length}
        openCount={openCount}
        filter={filter}
        onFilterChange={setFilter}
        filteredCount={filtered.length}
      />

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
