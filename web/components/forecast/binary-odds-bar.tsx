"use client";

import type { OutcomeConfig } from "@/lib/outcome-scale";
import { cn } from "@/lib/utils";

export function BinaryOddsBar({
  config,
  value,
  crowdValue,
  resolved,
  onChange,
  disabled,
  size = "md",
}: {
  config: OutcomeConfig;
  /** 0–100 lean toward the high option. */
  value: number;
  crowdValue?: number;
  resolved?: number;
  onChange?: (v: number) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const low = config.optionLow ?? "No";
  const high = config.optionHigh ?? "Yes";
  const pct = Math.max(0, Math.min(100, value));
  const crowdPct =
    crowdValue != null && Number.isFinite(crowdValue)
      ? Math.max(0, Math.min(100, crowdValue))
      : null;
  const resolvedPct =
    resolved != null && Number.isFinite(resolved) ? Math.max(0, Math.min(100, resolved)) : null;
  const interactive = onChange != null && !disabled;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <span
          className={cn(
            "font-mono uppercase tracking-[0.14em] text-white/40",
            size === "lg" ? "text-xs" : "text-[10px]",
          )}
        >
          {low}
        </span>
        <p
          className={cn(
            "font-serif tabular-nums text-[#f3efe6]",
            size === "lg" ? "text-4xl" : size === "md" ? "text-3xl" : "text-2xl",
          )}
        >
          {Math.round(pct)}%
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#d8c69a]/80">
            {high}
          </span>
        </p>
        <span
          className={cn(
            "font-mono uppercase tracking-[0.14em] text-white/40",
            size === "lg" ? "text-xs" : "text-[10px]",
          )}
        >
          {high}
        </span>
      </div>

      <div className="relative h-3 rounded-full bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[#d8c69a]/35"
          style={{ width: `${pct}%` }}
        />
        {crowdPct != null && crowdPct !== pct && (
          <div
            className="absolute top-1/2 z-10 h-4 w-0.5 -translate-y-1/2 bg-white/50"
            style={{ left: `${crowdPct}%` }}
            title={`Crowd ${Math.round(crowdPct)}%`}
          />
        )}
        {resolvedPct != null && (
          <div
            className="absolute top-1/2 z-20 h-5 w-1 -translate-y-1/2 rounded-sm bg-emerald-400"
            style={{ left: `${resolvedPct}%` }}
            title={`Resolved ${Math.round(resolvedPct)}%`}
          />
        )}
        {interactive && (
          <input
            type="range"
            min={config.min}
            max={config.max}
            step={1}
            value={pct}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute inset-0 z-30 h-full w-full cursor-pointer opacity-0"
            aria-label={`Lean toward ${high}`}
          />
        )}
        <div
          className="pointer-events-none absolute top-1/2 z-[15] size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#d8c69a] bg-[#141416]"
          style={{ left: `${pct}%` }}
        />
      </div>

      {crowdPct != null && (
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
          Crowd at {Math.round(crowdPct)}% {high}
        </p>
      )}
    </div>
  );
}
