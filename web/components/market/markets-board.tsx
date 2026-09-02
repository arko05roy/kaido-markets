"use client";

import { useMemo, useState } from "react";

import {
  DashboardPageHeader,
  MetricChip,
} from "@/components/app/dashboard-page-header";
import {
  Panel,
  PrimaryLink,
} from "@/components/app/kaido-ui";
import { MarketCardItem } from "@/components/market/market-card";
import {
  MarketFilterSheet,
  MobileFilterTrigger,
} from "@/components/market/market-filter-sheet";
import { statusLabel } from "@/lib/market-display";
import type { SavedMarketMetadata } from "@/lib/market-metadata";
import type { MarketStats24h } from "@/lib/market-stats";
import type { MarketCard } from "@/lib/market-types";

export type MarketFilter = "all" | "hot" | "closing" | "new" | "wide" | "moves";

function sortMarkets(
  markets: MarketCard[],
  filter: MarketFilter,
  statsByMarket: Record<string, MarketStats24h>,
): MarketCard[] {
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
      return copy.sort((a, b) => {
        const volA = statsByMarket[a.address]?.volumeUsdc ?? 0;
        const volB = statsByMarket[b.address]?.volumeUsdc ?? 0;
        if (volB !== volA) return volB - volA;
        const openA = statusLabel(a.status) === "Open" ? 1 : 0;
        const openB = statusLabel(b.status) === "Open" ? 1 : 0;
        if (openB !== openA) return openB - openA;
        return Number(a.info.window.lock) - Number(b.info.window.lock);
      });
    case "moves":
      return copy.sort((a, b) => {
        const moveA = Math.abs(statsByMarket[a.address]?.crowdMovedPct ?? 0);
        const moveB = Math.abs(statsByMarket[b.address]?.crowdMovedPct ?? 0);
        return moveB - moveA;
      });
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
  { id: "moves", label: "Biggest moves" },
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
  onMobileFilterOpen,
}: {
  network: string;
  marketsCount: number;
  openCount: number;
  filter: MarketFilter;
  onFilterChange: (f: MarketFilter) => void;
  filteredCount: number;
  showFilters?: boolean;
  onMobileFilterOpen?: () => void;
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
            <div className="hidden gap-1 overflow-x-auto rounded-xl bg-[#141416]/60 p-1 sm:flex">
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
            <MobileFilterTrigger onClick={() => onMobileFilterOpen?.()} />
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

export function MarketsBoard({
  markets,
  openCount,
  network,
  metadataByMarket = {},
  statsByMarket = {},
}: {
  markets: MarketCard[];
  openCount: number;
  network: string;
  metadataByMarket?: Record<string, SavedMarketMetadata>;
  statsByMarket?: Record<string, MarketStats24h>;
}) {
  const [filter, setFilter] = useState<MarketFilter>("all");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const filtered = useMemo(
    () => sortMarkets(markets, filter, statsByMarket),
    [markets, filter, statsByMarket],
  );

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
        onMobileFilterOpen={() => setFilterSheetOpen(true)}
      />

      <MarketFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        filter={filter}
        onFilterChange={setFilter}
      />

      {filtered.length === 0 ? (
        <Panel className="border-dashed px-8 py-12 text-center">
          <p className="text-sm text-white/50">No markets match this filter.</p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((card) => (
            <MarketCardItem
              key={card.address}
              card={card}
              metadata={metadataByMarket[card.address]}
              stats={statsByMarket[card.address]}
            />
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
