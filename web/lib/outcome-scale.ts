/**
 * Off-chain outcome frame — what the chart x-axis means (on-chain is still ℝ).
 */
export type MarketStyle = "binary" | "kaido";

/** @deprecated use MarketStyle */
export type OutcomeKind = "binary" | "numeric" | "probability" | "price" | "open";

export interface OutcomeConfig {
  style: MarketStyle;
  min: number;
  max: number;
  divisions: number[];
  optionLow?: string;
  optionHigh?: string;
}

export function evenDivisions(min: number, max: number, count: number): number[] {
  const n = Math.max(2, Math.min(24, Math.floor(count)));
  if (!(max > min)) return [min, max];
  if (n === 2) return [min, max];
  const span = max - min;
  return Array.from({ length: n }, (_, i) => roundDivision(min + (span * i) / (n - 1)));
}

function roundDivision(v: number): number {
  const abs = Math.abs(v);
  if (abs >= 10_000) return Math.round(v);
  if (abs >= 100) return Math.round(v * 10) / 10;
  if (abs >= 1) return Math.round(v * 100) / 100;
  return Math.round(v * 1000) / 1000;
}

export function defaultBinaryConfig(): OutcomeConfig {
  return {
    style: "binary",
    min: 0,
    max: 100,
    divisions: [0, 100],
    optionLow: "No",
    optionHigh: "Yes",
  };
}

export function defaultKaidoConfig(): OutcomeConfig {
  const min = 0;
  const max = 100;
  return { style: "kaido", min, max, divisions: evenDivisions(min, max, 5) };
}

export function defaultOpeningCall(config: OutcomeConfig): string {
  return String((config.min + config.max) / 2);
}

export function defaultOpeningWidth(config: OutcomeConfig): string {
  if (config.style === "binary") return "17";
  const span = Math.max(config.max - config.min, 1);
  return String(span / 6);
}

export function chartRangeForConfig(
  config: OutcomeConfig | null,
  mu: number,
  sigma: number,
): { min: number; max: number } {
  if (config) return { min: config.min, max: config.max };
  const sig = Math.max(sigma, 1e-12);
  return { min: mu - 5 * sig, max: mu + 5 * sig };
}

/** @deprecated use chartRangeForConfig */
export function chartRangeForScale(
  scale: { kind: OutcomeKind; min: number; max: number } | null,
  mu: number,
  sigma: number,
): { min: number; max: number } {
  if (scale && scale.kind !== "open") return { min: scale.min, max: scale.max };
  const sig = Math.max(sigma, 1e-12);
  return { min: mu - 5 * sig, max: mu + 5 * sig };
}

export function formatXTick(config: OutcomeConfig | null, v: number): string {
  if (!config || !Number.isFinite(v)) return "";
  if (config.style === "binary") {
    if (v <= config.min + 1e-9) return config.optionLow ?? "No";
    if (v >= config.max - 1e-9) return config.optionHigh ?? "Yes";
    return `${Math.round(v)}%`;
  }
  const abs = Math.abs(v);
  if (abs >= 10_000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (abs >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toPrecision(3);
}

export function parseOutcomeConfig(meta: {
  marketStyle?: string;
  outcomeKind?: string;
  outcomeMin?: number;
  outcomeMax?: number;
  divisions?: number[];
  optionLow?: string;
  optionHigh?: string;
}): OutcomeConfig | null {
  const style =
    meta.marketStyle === "binary" || meta.marketStyle === "kaido"
      ? meta.marketStyle
      : meta.outcomeKind === "probability"
        ? "binary"
        : meta.outcomeKind === "price" || meta.outcomeKind === "numeric"
          ? "kaido"
          : null;
  if (!style) return null;

  if (style === "binary") {
    const min = typeof meta.outcomeMin === "number" ? meta.outcomeMin : 0;
    const max = typeof meta.outcomeMax === "number" ? meta.outcomeMax : 100;
    return {
      style: "binary",
      min,
      max,
      divisions: [min, max],
      optionLow: meta.optionLow?.trim() || "No",
      optionHigh: meta.optionHigh?.trim() || "Yes",
    };
  }

  const min = meta.outcomeMin;
  const max = meta.outcomeMax;
  if (typeof min !== "number" || typeof max !== "number" || !(max > min)) return null;
  const divisions =
    Array.isArray(meta.divisions) && meta.divisions.length >= 2
      ? meta.divisions.filter((n) => typeof n === "number" && Number.isFinite(n))
      : evenDivisions(min, max, 5);
  if (divisions.length < 2) return null;
  return { style: "kaido", min, max, divisions };
}
