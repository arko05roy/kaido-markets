"use client";

/**
 * BeliefChart — read-only render of a distribution-market belief, built on
 * `recharts`. Two modes:
 *   - `scalar`: the payout curves `f(x) = λφ_{μ,σ}(x)` over a number line —
 *     consensus (faint) vs "you" (solid), plus optional `b` cap and resolved
 *     value markers.
 *   - `trajectory`: x = checkpoint time; live samples + the consensus path + the
 *     "you" path + a ±σ confidence band.
 *
 * The curves come from `web/lib/curve` (`renderGaussian`) — the byte-exact
 * `kaido-math` port — so what's drawn is exactly what would be submitted (ADR-8).
 * No bespoke SVG, no pointer code: this is display only.
 */
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { fromWad, gridOverRange, renderGaussian, type GaussianBelief } from "@/lib/curve";

const GRID_POINTS = 96;

const COLORS = {
  you: "var(--primary, #2563eb)",
  consensus: "var(--muted-foreground, #71717a)",
  samples: "var(--chart-1, #f59e0b)",
  band: "var(--primary, #2563eb)",
} as const;

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toPrecision(2);
}

function Frame({ height, children, empty }: { height: number; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="w-full rounded-lg border bg-card p-2" style={{ height }}>
      {empty ? (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          no data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      )}
    </div>
  );
}

export interface ScalarBeliefChartProps {
  mode: "scalar";
  market: { kWad: bigint; bWad: bigint; capped?: boolean };
  /** Outcome-value window to plot over (real units). */
  range: { min: number; max: number };
  consensus: GaussianBelief;
  you?: GaussianBelief;
  /** Realised outcome (real units), once known. */
  resolved?: number;
  height?: number;
}

export interface TrajectoryBeliefChartProps {
  mode: "trajectory";
  market: { kWad: bigint };
  /** Checkpoint x-values (any consistent unit — e.g. unix seconds or s-from-now). */
  checkpoints: number[];
  /** Consensus mean per checkpoint (real units), aligned to `checkpoints`. */
  consensusMus: number[];
  /** Your mean per checkpoint (real units). */
  youMus?: number[];
  /** Your σ per checkpoint (real units) — drawn as a ±σ band. */
  youSigmas?: number[];
  /** Historical samples to show as a line (e.g. the live BTC feed). */
  samples?: { x: number; y: number }[];
  /** Realised value per checkpoint (real units), once known. */
  resolved?: number[];
  height?: number;
}

export type BeliefChartProps = ScalarBeliefChartProps | TrajectoryBeliefChartProps;

export function BeliefChart(props: BeliefChartProps) {
  const height = props.height ?? 280;

  const scalarData = useMemo(() => {
    if (props.mode !== "scalar") return null;
    const { range, market, consensus, you } = props;
    if (!(range.max > range.min) || !Number.isFinite(range.min)) return [];
    const xs = gridOverRange(range.min, range.max, GRID_POINTS);
    const c = renderGaussian(consensus, market, xs);
    const y = you ? renderGaussian(you, market, xs) : null;
    return xs.map((x, i) => ({
      x,
      consensus: c[i]?.y ?? 0,
      you: y ? (y[i]?.y ?? 0) : undefined,
    }));
  }, [props]);

  const trajData = useMemo(() => {
    if (props.mode !== "trajectory") return null;
    const { checkpoints, consensusMus, youMus, youSigmas, resolved } = props;
    return checkpoints.map((x, i) => {
      const mu = youMus?.[i];
      const sig = youSigmas?.[i] ?? 0;
      return {
        x,
        consensus: consensusMus[i] ?? null,
        you: mu ?? null,
        band: mu != null ? [mu - sig, mu + sig] : null,
        resolved: resolved?.[i] ?? null,
      };
    });
  }, [props]);

  if (props.mode === "scalar") {
    const data = scalarData ?? [];
    if (data.length === 0) return <Frame height={height} empty>{null}</Frame>;
    const bReal = fromWad(props.market.bWad);
    const peak = Math.max(...data.map((d) => Math.max(d.consensus, d.you ?? 0)));
    return (
      <Frame height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="x"
            type="number"
            domain={[props.range.min, props.range.max]}
            tickFormatter={fmtNum}
            tick={{ fontSize: 11 }}
          />
          <YAxis hide domain={[0, Math.max(peak, bReal) * 1.05]} />
          {bReal <= peak * 1.2 && (
            <ReferenceLine y={bReal} stroke={COLORS.consensus} strokeDasharray="2 4" />
          )}
          {props.resolved != null && Number.isFinite(props.resolved) && (
            <ReferenceLine x={props.resolved} stroke={COLORS.samples} strokeWidth={2} />
          )}
          <Area
            type="monotone"
            dataKey="consensus"
            stroke={COLORS.consensus}
            strokeDasharray="5 4"
            fill={COLORS.consensus}
            fillOpacity={0.08}
            isAnimationActive={false}
          />
          {data.some((d) => d.you != null) && (
            <Area
              type="monotone"
              dataKey="you"
              stroke={COLORS.you}
              strokeWidth={2}
              fill={COLORS.you}
              fillOpacity={0.18}
              isAnimationActive={false}
            />
          )}
        </AreaChart>
      </Frame>
    );
  }

  // trajectory
  const data = trajData ?? [];
  const samples = props.samples ?? [];
  if (data.length === 0 && samples.length === 0) return <Frame height={height} empty>{null}</Frame>;
  return (
    <Frame height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 11 }} tickFormatter={fmtNum} />
        <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11 }} width={56} domain={["auto", "auto"]} />
        {samples.length > 1 && (
          <Line
            data={samples}
            dataKey="y"
            type="monotone"
            stroke={COLORS.samples}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        )}
        {data.some((d) => d.band != null) && (
          <Area
            dataKey="band"
            stroke="none"
            fill={COLORS.band}
            fillOpacity={0.14}
            isAnimationActive={false}
          />
        )}
        {data.some((d) => d.consensus != null) && (
          <Line
            dataKey="consensus"
            type="monotone"
            stroke={COLORS.consensus}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            dot={{ r: 2 }}
            isAnimationActive={false}
            connectNulls
          />
        )}
        {data.some((d) => d.you != null) && (
          <Line
            dataKey="you"
            type="monotone"
            stroke={COLORS.you}
            strokeWidth={2.5}
            dot={{ r: 3 }}
            isAnimationActive={false}
            connectNulls
          />
        )}
        {data.some((d) => d.resolved != null) && (
          <Line
            dataKey="resolved"
            type="monotone"
            stroke={COLORS.samples}
            strokeWidth={2}
            strokeDasharray="1 0"
            dot={{ r: 3 }}
            isAnimationActive={false}
            connectNulls
          />
        )}
      </ComposedChart>
    </Frame>
  );
}
