"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

function formatEndpoint(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return n.toPrecision(2);
}

export type AxisTickItem = { value: number; label: string };

export function AxisLabelRail({
  min,
  max,
  items,
  className,
}: {
  min: number;
  max: number;
  items: AxisTickItem[];
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setTrackWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setTrackWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const span = max - min;
  const slotMaxW = useMemo(() => {
    const w = trackWidth || 320;
    const perTick = w / Math.max(items.length, 1);
    return Math.max(36, Math.min(96, Math.floor(perTick) - 4));
  }, [trackWidth, items.length]);

  if (!(span > 0) || items.length === 0) return null;

  return (
    <div className={cn("select-none px-2 pb-1 pt-2 sm:px-3", className)}>
      <div className="flex items-start gap-2">
        <span className="mt-2.5 w-11 shrink-0 text-right font-mono text-[10px] tabular-nums text-white/32">
          {formatEndpoint(min)}
        </span>

        <div ref={trackRef} className="relative h-11 min-w-0 flex-1">
          <div
            aria-hidden
            className="absolute left-0 right-0 top-2.5 h-px bg-gradient-to-r from-[#d8c69a]/20 via-white/12 to-[#d8c69a]/20"
          />

          {items.map((item, i) => {
            const pct = ((item.value - min) / span) * 100;
            const label = item.label.trim();
            if (!label) return null;
            const clamped = Math.min(98, Math.max(2, pct));

            return (
              <div
                key={`${i}-${item.value}`}
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${clamped}%`, width: slotMaxW }}
              >
                <span className="size-1.5 shrink-0 rounded-full bg-[#d8c69a]/80 ring-2 ring-[#0b0b0c]" />
                <span
                  title={label}
                  className="mt-1.5 w-full truncate text-center font-mono text-[11px] leading-snug tracking-[0.02em] text-white/58"
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        <span className="mt-2.5 w-11 shrink-0 font-mono text-[10px] tabular-nums text-white/32">
          {formatEndpoint(max)}
        </span>
      </div>
    </div>
  );
}
