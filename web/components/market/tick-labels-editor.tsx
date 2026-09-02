"use client";

import { Minus, Plus } from "lucide-react";

import {
  clampTickCount,
  interiorTicks,
  TICK_COUNT_MAX,
  TICK_COUNT_MIN,
} from "@/lib/outcome-scale";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-xl border border-white/[0.08] bg-[#0b0b0c] px-3 py-2.5 text-sm text-[#f3efe6] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-white/22 focus-visible:border-[#d8c69a]/40 focus-visible:ring-1 focus-visible:ring-[#d8c69a]/25";

function formatHint(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return String(n);
  return n.toPrecision(2);
}

export function TickLabelsEditor({
  count,
  onCountChange,
  labels,
  onLabelChange,
  rangeMin,
  rangeMax,
}: {
  count: number;
  onCountChange: (n: number) => void;
  labels: string[];
  onLabelChange: (index: number, value: string) => void;
  rangeMin: number;
  rangeMax: number;
}) {
  const boundsOk = Number.isFinite(rangeMin) && Number.isFinite(rangeMax) && rangeMax > rangeMin;
  const positions = boundsOk ? interiorTicks(rangeMin, rangeMax, labels.length) : [];

  const dec = () => onCountChange(clampTickCount(count - 1));
  const inc = () => onCountChange(clampTickCount(count + 1));

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#141416]/55 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
      {/* live axis strip */}
      <div className="border-b border-white/[0.06] px-4 py-5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="shrink-0 font-mono text-xs tabular-nums text-[#d8c69a]/75">
            {boundsOk ? formatHint(rangeMin) : "—"}
          </span>
          <div className="relative h-8 min-w-0 flex-1">
            <div
              aria-hidden
              className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-[#d8c69a]/25 via-white/12 to-[#d8c69a]/25"
            />
            {positions.map((pos, i) => {
              const pct = boundsOk ? ((pos - rangeMin) / (rangeMax - rangeMin)) * 100 : 50;
              const text = labels[i]?.trim();
              return (
                <div
                  key={i}
                  className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                  style={{ left: `${pct}%` }}
                >
                  <span
                    className={cn(
                      "mb-1 max-w-[4.5rem] truncate font-mono text-[9px] leading-none tracking-tight",
                      text ? "text-[#d8c69a]" : "text-transparent",
                    )}
                  >
                    {text || "·"}
                  </span>
                  <span
                    className={cn(
                      "size-2 rounded-full ring-2 ring-[#141416]",
                      text ? "bg-[#d8c69a]" : "bg-white/30",
                    )}
                  />
                </div>
              );
            })}
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-[#d8c69a]/75">
            {boundsOk ? formatHint(rangeMax) : "—"}
          </span>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/38">
          Labels along the line
        </p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/28">
            Ticks
          </span>
          <div className="flex items-center rounded-xl border border-white/[0.08] bg-[#0b0b0c] p-0.5">
            <button
              type="button"
              onClick={dec}
              disabled={count <= TICK_COUNT_MIN}
              aria-label="Fewer ticks"
              className="flex size-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/5 hover:text-[#f3efe6] disabled:opacity-30"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-[2.25rem] text-center font-mono text-sm tabular-nums text-[#f3efe6]">
              {count}
            </span>
            <button
              type="button"
              onClick={inc}
              disabled={count >= TICK_COUNT_MAX}
              aria-label="More ticks"
              className="flex size-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/5 hover:text-[#f3efe6] disabled:opacity-30"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* inputs */}
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
        {labels.map((label, i) => (
          <label key={i} className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/32">
              Tick {i + 1}
            </span>
            <input
              value={label}
              onChange={(e) => onLabelChange(i, e.target.value)}
              placeholder={
                positions[i] != null ? formatHint(positions[i]) : "Word or number"
              }
              aria-label={`Tick ${i + 1} label`}
              className={inputClass}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
