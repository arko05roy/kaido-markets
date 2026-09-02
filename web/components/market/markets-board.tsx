"use client";

import { useMemo, useState } from "react";

import {
  MetricChip,
  NetworkBadge,
} from "@/components/app/dashboard-page-header";
import {
  PageEyebrow,
  Panel,
  PrimaryLink,
  SectionLabel,
} from "@/components/app/kaido-ui";
import {
  MarketCardItem,
  partitionMarkets,
} from "@/components/market/market-card";
import {
  MarketFilterSheet,
  MobileFilterTrigger,
} from "@/components/market/market-filter-sheet";
import { statusLabel } from "@/lib/market-display";
import type { SavedMarketMetadata } from "@/lib/market-metadata";
import type { MarketStats24h } from "@/lib/market-stats";
import type { MarketCard } from "@/lib/market-types";
import { cn } from "@/lib/utils";

export type MarketFilter = "all" | "hot" | "closing" | "new" | "wide" | "moves";

function sortMarkets(
  markets: MarketCard[],
  filter: MarketFilter,
  statsByMarket: Record<string, MarketStats24h>,
): MarketCard[] {
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

function pickFeatured(
  markets: MarketCard[],
  filter: MarketFilter,
  statsByMarket: Record<string, MarketStats24h>,
): MarketCard | null {
  if (filter !== "all" && filter !== "hot") return null;
  const open = markets.filter((m) => statusLabel(m.status) === "Open");
  if (open.length < 2) return null;
  return [...open].sort(
    (a, b) =>
      (statsByMarket[b.address]?.volumeUsdc ?? 0) -
      (statsByMarket[a.address]?.volumeUsdc ?? 0),
  )[0];
}

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
    <header className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1c1c21] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.1),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-16 -left-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.05),transparent_65%)]" />

      <div className="relative flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <PageEyebrow>Live board</PageEyebrow>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.05] tracking-[-0.03em] text-[#f3efe6]">
                Markets
              </h1>
              <NetworkBadge network={network} />
            </div>
            <p className="max-w-[52ch] text-sm leading-relaxed text-white/45">
              Range beliefs on-chain — pick your zone, press conviction, trade the crowd.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <MetricChip label="Listed" value={marketsCount} />
            <MetricChip label="Open" value={openCount} accent />
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="hidden gap-1 overflow-x-auto rounded-xl border border-white/[0.04] bg-[#141416]/70 p-1 sm:flex">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onFilterChange(f.id)}
                  className={cn(
                    "shrink-0 rounded-lg px-3.5 py-2 text-[13px] transition-[background-color,color,box-shadow] duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c69a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c21]",
                    filter === f.id
                      ? "bg-[#2a2a30] font-medium text-[#f3efe6] shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
                      : "text-white/45 hover:text-white/70",
                  )}
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
        )}
      </div>
    </header>
  );
}

function MarketGrid({
  cards,
  metadataByMarket,
  statsByMarket,
  startIndex = 0,
}: {
  cards: MarketCard[];
  metadataByMarket: Record<string, SavedMarketMetadata>;
  statsByMarket: Record<string, MarketStats24h>;
  startIndex?: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {cards.map((card, i) => (
        <MarketCardItem
          key={card.address}
          card={card}
          metadata={metadataByMarket[card.address]}
          stats={statsByMarket[card.address]}
          className="market-card-enter"
          style={{ animationDelay: `${(startIndex + i) * 55}ms` }}
        />
      ))}
    </div>
  );
}

function SectionDivider({
  label,
  count,
  muted,
}: {
  label: string;
  count: number;
  muted?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-4", muted && "opacity-70")}>
      <SectionLabel>
        {label} · {count}
      </SectionLabel>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
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

  const featured = useMemo(
    () => pickFeatured(filtered, filter, statsByMarket),
    [filtered, filter, statsByMarket],
  );

  const showSections = filter === "all";
  const { live, settled } = useMemo(() => partitionMarkets(filtered), [filtered]);

  const liveWithoutFeatured = useMemo(() => {
    if (!featured) return live;
    return live.filter((m) => m.address !== featured.address);
  }, [live, featured]);

  const gridCards = useMemo(() => {
    if (showSections) return liveWithoutFeatured;
    if (featured) return filtered.filter((m) => m.address !== featured.address);
    return filtered;
  }, [showSections, liveWithoutFeatured, featured, filtered]);

  if (markets.length === 0) {
    return (
      <div className="space-y-6">
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
    <div className="space-y-6">
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
        <div className="space-y-8">
          {featured && (
            <MarketCardItem
              card={featured}
              metadata={metadataByMarket[featured.address]}
              stats={statsByMarket[featured.address]}
              variant="featured"
              className="market-card-enter"
            />
          )}

          {showSections ? (
            <>
              {liveWithoutFeatured.length > 0 && (
                <section className="space-y-4">
                  <SectionDivider label="Live" count={live.length} />
                  <MarketGrid
                    cards={liveWithoutFeatured}
                    metadataByMarket={metadataByMarket}
                    statsByMarket={statsByMarket}
                    startIndex={featured ? 1 : 0}
                  />
                </section>
              )}

              {settled.length > 0 && (
                <section className="space-y-4">
                  <SectionDivider
                    label="Archive"
                    count={settled.length}
                    muted
                  />
                  <MarketGrid
                    cards={settled}
                    metadataByMarket={metadataByMarket}
                    statsByMarket={statsByMarket}
                    startIndex={liveWithoutFeatured.length + (featured ? 1 : 0)}
                  />
                </section>
              )}
            </>
          ) : (
            <MarketGrid
              cards={gridCards}
              metadataByMarket={metadataByMarket}
              statsByMarket={statsByMarket}
              startIndex={featured ? 1 : 0}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function MarketsEmpty({ action }: { action?: React.ReactNode }) {
  return (
    <Panel className="relative flex flex-col items-center gap-4 overflow-hidden border-dashed px-8 py-16 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(216,198,154,0.06),transparent_70%)]" />
      <p className="relative font-serif text-2xl text-[#f3efe6]">No markets yet</p>
      <p className="relative max-w-md text-sm leading-relaxed text-white/50">
        Be the first to open a range market. Pick an outcome, set the oracle, seed the crowd curve.
      </p>
      <div className="relative">{action ?? <PrimaryLink href="/create">Create a market</PrimaryLink>}</div>
    </Panel>
  );
}
