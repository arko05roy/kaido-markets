"use client";

import type { MarketStats24h } from "@/lib/market-stats";
import { cn } from "@/lib/utils";

function fmtVol(usdc: number): string {
  if (usdc >= 1_000_000) return `$${(usdc / 1_000_000).toFixed(1)}M`;
  if (usdc >= 1_000) return `$${(usdc / 1_000).toFixed(1)}k`;
  return `$${usdc.toFixed(0)}`;
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1",
        accent
          ? "border-[#d8c69a]/25 bg-[#d8c69a]/[0.08]"
          : "border-white/[0.06] bg-white/[0.02]",
      )}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          accent ? "text-[#d8c69a]" : "text-white/70",
        )}
      >
        {value}
      </span>
    </span>
  );
}

export function MarketCardStats({
  stats,
  variant = "inline",
}: {
  stats?: MarketStats24h;
  variant?: "inline" | "chips";
}) {
  if (!stats) return null;

  const chips: { label: string; value: string; accent?: boolean }[] = [];
  if (stats.volumeUsdc != null) {
    chips.push({ label: "24h vol", value: fmtVol(stats.volumeUsdc), accent: true });
  }
  if (stats.traderCount != null) {
    chips.push({ label: "Traders", value: String(stats.traderCount) });
  }
  if (stats.crowdMovedPct != null) {
    const sign = stats.crowdMovedPct >= 0 ? "+" : "";
    chips.push({
      label: "Moved",
      value: `${sign}${stats.crowdMovedPct.toFixed(1)}%`,
      accent: Math.abs(stats.crowdMovedPct) >= 5,
    });
  }
  if (chips.length === 0) return null;

  if (variant === "chips") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <StatChip key={c.label} label={c.label} value={c.value} accent={c.accent} />
        ))}
      </div>
    );
  }

  return (
    <p className="font-mono text-[10px] tabular-nums tracking-tight text-white/35">
      {chips.map((c) => `${c.label} ${c.value}`).join("   ·   ")}
    </p>
  );
}
