"use client";

/**
 * BeliefChart — read-only render of a distribution-market belief, built on
 * `recharts`. Two modes:
 *   - `scalar`: the payout curves `f(x) = λφ_{μ,σ}(x)` over a number line —
 *     consensus (faint) vs "you" (solid), plus optional `b` cap and resolved
 *     value markers.
 *   - `trajectory`: x = checkpoint time; live samples + the consensus path + the
 *     "you" path + a ±σ confidence band.
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

import { AxisLabelRail, type AxisTickItem } from "@/components/forecast/axis-label-rail";
import { fromWad, gridForScalarBeliefs, renderGaussian, peakAtBeliefMu, type GaussianBelief } from "@/lib/curve";
import { cn } from "@/lib/utils";

const COLORS = {
  you: "#d8c69a",
  consensus: "rgba(255,255,255,0.35)",
  samples: "#d8c69a",
  band: "rgba(216,198,154,0.25)",
} as const;

const GRID_STROKE = "rgba(255,255,255,0.06)";

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toPrecision(2);
}

function ChartShell({
  height,
  children,
  footer,
  empty,
  flat,
}: {
  height: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
  empty?: boolean;
  flat?: boolean;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <div
      className={cn(
        "w-full min-w-0",
        flat ? "bg-transparent" : "border border-white/10 bg-[#0b0b0c] p-2",
      )}
      style={{ height, minHeight: height }}
    >
      {empty ? (
        <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
          no data yet
        </div>
      ) : !ready ? (
        <div className="h-full" aria-hidden />
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="relative min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
              {children as React.ReactElement}
            </ResponsiveContainer>
          </div>
          {footer ? <div className="shrink-0">{footer}</div> : null}
        </div>
      )}
    </div>
  );
}

export interface ScalarBeliefChartProps {
  mode: "scalar";
  market: { kWad: bigint; bWad: bigint; capped?: boolean };
  range: { min: number; max: number };
  consensus: GaussianBelief;
  you?: GaussianBelief;
  anchorYToConsensus?: boolean;
  resolved?: number;
  xTicks?: number[];
  /** Index-aligned labels — preferred over `formatXTick` for the axis rail. */
  xAxisItems?: AxisTickItem[];
  formatXTick?: (v: number) => string;
  height?: number;
  /** Drop outer border when nested inside a panel. */
  flat?: boolean;
}

export interface TrajectoryBeliefChartProps {
  mode: "trajectory";
  market: { kWad: bigint };
  checkpoints: number[];
  consensusMus: number[];
  youMus?: number[];
  youSigmas?: number[];
  samples?: { x: number; y: number }[];
  resolved?: number[];
  height?: number;
  flat?: boolean;
}

export type BeliefChartProps = ScalarBeliefChartProps | TrajectoryBeliefChartProps;

export function BeliefChart(props: BeliefChartProps) {
  const height = props.height ?? 280;
  const flat = props.flat ?? false;

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

  const axisItems = useMemo((): AxisTickItem[] => {
    if (props.mode !== "scalar") return [];
    if (props.xAxisItems?.length) return props.xAxisItems;
    if (!props.xTicks?.length) return [];
    const fmt = props.formatXTick ?? fmtNum;
    return props.xTicks.map((value) => ({ value, label: fmt(value) }));
  }, [
    props.mode,
    props.mode === "scalar" ? props.xAxisItems : undefined,
    props.mode === "scalar" ? props.xTicks : undefined,
    props.mode === "scalar" ? props.formatXTick : undefined,
  ]);

  if (props.mode === "scalar") {
    const data = scalarData ?? [];
    if (data.length === 0) {
      return (
        <ChartShell height={height} flat={flat} empty>
          {null}
        </ChartShell>
      );
    }

    const bReal = fromWad(props.market.bWad);
    const consensusPeak = Math.max(...data.map((d) => d.consensus), 0);
    const youGridPeak = Math.max(...data.map((d) => d.you ?? 0), 0);
    const youMuPeak = props.you != null ? peakAtBeliefMu(props.you, props.market) : 0;
    const youPeak = Math.max(youGridPeak, youMuPeak);
    const crowdAnchor = consensusPeak > 0 ? consensusPeak * 1.18 : 0;
    const yMax =
      props.anchorYToConsensus && props.you != null && crowdAnchor > 0
        ? Math.max(crowdAnchor, youPeak * 1.08)
        : Math.max(consensusPeak, youPeak) > 0
          ? Math.max(consensusPeak, youPeak) * 1.12
          : Math.max(bReal, 1);

    const hasLabelRail = axisItems.length > 0;
    const formatLabel = props.formatXTick ?? fmtNum;

    return (
      <ChartShell
        height={height}
        flat={flat}
        footer={
          hasLabelRail ? (
            <AxisLabelRail min={props.range.min} max={props.range.max} items={axisItems} />
          ) : undefined
        }
      >
        <AreaChart data={data} margin={{ top: 12, right: 8, bottom: hasLabelRail ? 4 : 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={[props.range.min, props.range.max]}
            hide={hasLabelRail}
            ticks={hasLabelRail ? undefined : props.xTicks}
            tickFormatter={(v) => formatLabel(Number(v))}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.38)" }}
            stroke="rgba(255,255,255,0.12)"
            scale="linear"
            tickLine={false}
            axisLine={false}
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
      </ChartShell>
    );
  }

  const data = trajData ?? [];
  const samples = props.samples ?? [];
  if (data.length === 0 && samples.length === 0) {
    return (
      <ChartShell height={height} flat={flat} empty>
        {null}
      </ChartShell>
    );
  }

  return (
    <ChartShell height={height} flat={flat}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 20, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis
          dataKey="x"
          type="number"
          domain={["dataMin", "dataMax"]}
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.38)" }}
          stroke="rgba(255,255,255,0.12)"
          tickFormatter={fmtNum}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={fmtNum}
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.38)" }}
          stroke="rgba(255,255,255,0.12)"
          width={48}
          domain={["auto", "auto"]}
          tickLine={false}
          axisLine={false}
        />
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
    </ChartShell>
  );
}
