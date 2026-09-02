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
  /** Optional display labels aligned to `divisions` (on-chain values stay numeric). */
  divisionLabels?: string[];
  optionLow?: string;
  optionHigh?: string;
}

export const TICK_COUNT_MIN = 2;
export const TICK_COUNT_MAX = 24;

export function clampTickCount(count: number): number {
  return Math.max(TICK_COUNT_MIN, Math.min(TICK_COUNT_MAX, Math.floor(count)));
}

/** Evenly spaced ticks strictly between endpoints — edge ticks clip in Recharts. */
export function interiorTicks(min: number, max: number, count: number): number[] {
  const n = clampTickCount(count);
  if (!(max > min) || n < 1) return [];
  if (n === 1) return [roundDivision((min + max) / 2)];
  const span = max - min;
  return Array.from({ length: n }, (_, i) => roundDivision(min + (span * (i + 1)) / (n + 1)));
}

/** @deprecated prefer interiorTicks for chart guides */
export function evenDivisions(min: number, max: number, count: number): number[] {
  const n = clampTickCount(count);
  if (!(max > min)) return [min, max];
  if (n === 2) return [min, max];
  const span = max - min;
  return Array.from({ length: n }, (_, i) => roundDivision(min + (span * i) / (n - 1)));
}

function parseNumericLabel(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "").replace(/^\$/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Map user-facing tick labels (words or numbers) to chart positions. Empty slots auto-place. */
export function parseTickLabels(
  labels: string[],
  min: number,
  max: number,
): { divisions: number[]; divisionLabels?: string[] } | null {
  const n = labels.length;
  if (n < TICK_COUNT_MIN || !(max > min)) return null;

  const interiors = interiorTicks(min, max, n);
  const divisions: number[] = [];
  const divisionLabels: string[] = [];

  for (let i = 0; i < n; i++) {
    const raw = labels[i].trim();
    if (!raw) {
      divisions.push(interiors[i]);
      divisionLabels.push("");
      continue;
    }
    const num = parseNumericLabel(raw);
    if (num != null && num >= min && num <= max) {
      divisions.push(roundDivision(num));
      divisionLabels.push("");
    } else {
      divisions.push(interiors[i]);
      divisionLabels.push(raw);
    }
  }

  const hasText = divisionLabels.some((l) => l.length > 0);
  return { divisions, ...(hasText ? { divisionLabels } : {}) };
}

export function defaultTickLabels(_min: number, _max: number, count: number): string[] {
  return Array(clampTickCount(count)).fill("");
}

export function tickLabelsFromConfig(divisions: number[], divisionLabels?: string[]): string[] {
  return divisions.map((v, i) => {
    const lab = divisionLabels?.[i]?.trim();
    return lab || String(v);
  });
}

export function resizeTickLabels(
  prev: string[],
  nextCount: number,
  min: number,
  max: number,
): string[] {
  const n = clampTickCount(nextCount);
  if (prev.length === n) return prev;
  if (prev.length < n) {
    return [...prev, ...Array(n - prev.length).fill("")];
  }
  return prev.slice(0, n);
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
  return { style: "kaido", min, max, divisions: interiorTicks(min, max, 5) };
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

function divisionDisplayLabel(config: OutcomeConfig, v: number): string | null {
  const labels = config.divisionLabels;
  if (!labels?.length) return null;
  const idx = config.divisions.findIndex((d) => Math.abs(d - v) <= 1e-6);
  if (idx < 0) return null;
  const label = labels[idx]?.trim();
  return label || null;
}

export function formatXTick(config: OutcomeConfig | null, v: number): string {
  if (!config || !Number.isFinite(v)) return "";
  if (config.style === "binary") {
    if (v <= config.min + 1e-9) return config.optionLow ?? "No";
    if (v >= config.max - 1e-9) return config.optionHigh ?? "Yes";
    return `${Math.round(v)}%`;
  }
  const custom = divisionDisplayLabel(config, v);
  if (custom) return custom;
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
  divisionLabels?: string[];
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
      : interiorTicks(min, max, 5);
  if (divisions.length < 2) return null;
  const divisionLabels = Array.isArray(meta.divisionLabels)
    ? meta.divisionLabels.map((s) => (typeof s === "string" ? s.trim() : ""))
    : undefined;
  const hasLabels = divisionLabels?.some((l) => l.length > 0);
  return {
    style: "kaido",
    min,
    max,
    divisions,
    ...(hasLabels ? { divisionLabels } : {}),
  };
}
