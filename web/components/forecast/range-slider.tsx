"use client";

import { Slider } from "@/components/ui/slider";

/**
 * A labelled single-value slider with a formatted readout. Thin wrapper over the
 * Radix-backed {@link Slider} so every belief control is accessible (keyboard,
 * ARIA, touch) without bespoke pointer code.
 */
export interface RangeSliderProps {
  label: string;
  /** Optional caption shown small under the label (e.g. "loose ↔ tight"). */
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** Format the numeric value for display (default: rounded to ≤4 sig digits). */
  format?: (v: number) => string;
  disabled?: boolean;
  ariaLabel?: string;
}

function defaultFormat(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toPrecision(3);
}

export function RangeSlider({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  format = defaultFormat,
  disabled,
  ariaLabel,
}: RangeSliderProps) {
  // Guard against degenerate ranges (min == max) — Radix needs min < max.
  const hi = max > min ? max : min + (step || 1);
  const clamped = Math.min(hi, Math.max(min, value));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{format(clamped)}</span>
      </div>
      <Slider
        aria-label={ariaLabel ?? label}
        min={min}
        max={hi}
        step={step}
        value={[clamped]}
        disabled={disabled}
        onValueChange={(vs) => {
          const next = vs[0];
          if (typeof next === "number" && Number.isFinite(next)) onChange(next);
        }}
      />
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}
