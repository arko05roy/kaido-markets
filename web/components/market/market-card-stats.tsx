"use client";

import type { MarketStats24h } from "@/lib/market-stats";

function fmtVol(usdc: number): string {
  if (usdc >= 1_000_000) return `$${(usdc / 1_000_000).toFixed(1)}M`;
  if (usdc >= 1_000) return `$${(usdc / 1_000).toFixed(1)}k`;
  return `$${usdc.toFixed(0)}`;
}

export function MarketCardStats({ stats }: { stats?: MarketStats24h }) {
  if (!stats) return null;
  const parts: string[] = [];
  if (stats.volumeUsdc != null) {
    parts.push(`24h vol ${fmtVol(stats.volumeUsdc)}`);
  }
  if (stats.traderCount != null) {
    parts.push(`Traders ${stats.traderCount}`);
  }
  if (stats.crowdMovedPct != null) {
    const sign = stats.crowdMovedPct >= 0 ? "+" : "";
    parts.push(`Moved ${sign}${stats.crowdMovedPct.toFixed(1)}%`);
  }
  if (parts.length === 0) return null;

  return (
    <p className="font-mono text-[10px] tabular-nums tracking-tight text-white/35">
      {parts.join("   ·   ")}
    </p>
  );
}
