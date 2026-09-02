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
import { useEffect, useMemo, useState } from "react";
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

import { fromWad, gridForScalarBeliefs, renderGaussian, peakAtBeliefMu, type GaussianBelief } from "@/lib/curve";

const GRID_POINTS = 96;

const COLORS = {
  you: "#d8c69a",
  consensus: "rgba(255,255,255,0.35)",
  samples: "#d8c69a",
  band: "rgba(216,198,154,0.25)",
} as const;

const AXIS_TICK = { fontSize: 11, fill: "rgba(255,255,255,0.42)" };
const GRID_STROKE = "rgba(255,255,255,0.06)";

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toPrecision(2);
}

function Frame({ height, children, empty }: { height: number; children: React.ReactNode; empty?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  // ResponsiveContainer needs a concrete pixel height — percentage height fails in grid/flex layouts.
  const innerH = Math.max(height - 16, 120);

  return (
    <div
      className="w-full min-w-0 border border-white/10 bg-[#0b0b0c] p-2"
      style={{ height, minHeight: height }}
    >
      {empty ? (
        <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
          no data yet
        </div>
      ) : !ready ? (
        <div style={{ height: innerH }} aria-hidden />
      ) : (
        <ResponsiveContainer width="100%" height={innerH} minWidth={0} debounce={50}>
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
  /** Keep Y scale locked to the crowd curve when overlaying your belief. */
  anchorYToConsensus?: boolean;
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

  const scalarConsensusSeries = useMemo(() => {
    if (props.mode !== "scalar") return null;
    const { range, market, consensus } = props;
    if (!(range.max > range.min) || !Number.isFinite(range.min)) return [];
    const xs = gridForScalarBeliefs(range, [consensus]);
    const c = renderGaussian(consensus, market, xs);
    return xs.map((x, i) => ({ x, consensus: c[i]?.y ?? 0 }));
  }, [
    props.mode,
    props.mode === "scalar" ? props.range.min : null,
    props.mode === "scalar" ? props.range.max : null,
    props.mode === "scalar" ? props.market.kWad : null,
    props.mode === "scalar" ? props.market.bWad : null,
    props.mode === "scalar" ? props.market.capped : null,
    props.mode === "scalar" ? props.consensus.muWad : null,
    props.mode === "scalar" ? props.consensus.sigmaWad : null,
  ]);

  const scalarData = useMemo((): { x: number; consensus: number; you?: number }[] | null => {
    if (props.mode !== "scalar" || !scalarConsensusSeries) return null;
    const { market, consensus, you, range } = props;
    if (!you) return scalarConsensusSeries;
    const xs = gridForScalarBeliefs(range, [consensus, you]);
    const c = renderGaussian(consensus, market, xs);
    const y = renderGaussian(you, market, xs);
    return xs.map((x, i) => ({
      x,
      consensus: c[i]?.y ?? 0,
      you: y[i]?.y ?? 0,
    }));
  }, [
    scalarConsensusSeries,
    props.mode,
    props.mode === "scalar" ? props.you?.muWad : null,
    props.mode === "scalar" ? props.you?.sigmaWad : null,
    props.mode === "scalar" ? props.consensus.muWad : null,
    props.mode === "scalar" ? props.consensus.sigmaWad : null,
    props.mode === "scalar" ? props.range.min : null,
    props.mode === "scalar" ? props.range.max : null,
    props.mode === "scalar" ? props.market.kWad : null,
    props.mode === "scalar" ? props.market.bWad : null,
    props.mode === "scalar" ? props.market.capped : null,
  ]);

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
    const consensusPeak = Math.max(...data.map((d) => d.consensus), 0);
    const youGridPeak = Math.max(...data.map((d) => d.you ?? 0), 0);
    const youMuPeak =
      props.you != null ? peakAtBeliefMu(props.you, props.market) : 0;
    const youPeak = Math.max(youGridPeak, youMuPeak);
    // Anchor to crowd, but grow headroom when sniper peak exceeds it (never shrink below crowd).
    const crowdAnchor = consensusPeak > 0 ? consensusPeak * 1.18 : 0;
    const yMax =
      props.anchorYToConsensus && props.you != null && crowdAnchor > 0
        ? Math.max(crowdAnchor, youPeak * 1.08)
        : Math.max(consensusPeak, youPeak) > 0
          ? Math.max(consensusPeak, youPeak) * 1.12
          : Math.max(bReal, 1);
    return (
      <Frame height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis
            dataKey="x"
            type="number"
            domain={[props.range.min, props.range.max]}
            tickFormatter={fmtNum}
            tick={AXIS_TICK}
            stroke="rgba(255,255,255,0.15)"
            scale="linear"
          />
          <YAxis hide domain={[0, yMax]} />
          {bReal > 0 && bReal <= yMax * 0.98 && (
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
            dot={false}
            connectNulls
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
              dot={false}
              connectNulls
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
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis
          dataKey="x"
          type="number"
          domain={["dataMin", "dataMax"]}
          tick={AXIS_TICK}
          stroke="rgba(255,255,255,0.15)"
          tickFormatter={fmtNum}
        />
        <YAxis tickFormatter={fmtNum} tick={AXIS_TICK} stroke="rgba(255,255,255,0.15)" width={56} domain={["auto", "auto"]} />
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
