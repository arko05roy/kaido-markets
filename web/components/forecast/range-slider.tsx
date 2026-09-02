"use client";

import { Slider } from "@/components/ui/slider";

export interface RangeSliderProps {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Show large centered readout (for "Your call"). */
  prominent?: boolean;
  /** Endpoint labels under the track, e.g. Wide / Tight. */
  endpoints?: [string, string];
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
  prominent,
  endpoints,
}: RangeSliderProps) {
  const hi = max > min ? max : min + (step || 1);
  const clamped = Math.min(hi, Math.max(min, value));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">{label}</span>
        {!prominent && (
          <span className="font-mono text-xs tabular-nums text-[#d8c69a]">{format(clamped)}</span>
        )}
      </div>
      {prominent && (
        <p className="text-center font-serif text-3xl tabular-nums tracking-tight text-[#f3efe6] sm:text-4xl">
          {format(clamped)}
        </p>
      )}
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
      {endpoints && (
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">
          <span>{endpoints[0]}</span>
          <span>{endpoints[1]}</span>
        </div>
      )}
      {hint && <span className="text-[11px] text-white/40">{hint}</span>}
    </div>
  );
}
