"use client";

/**
 * TrajectoryBeliefInput — set a per-checkpoint Gaussian belief for a trajectory
 * market with sliders (no freehand path). Each checkpoint gets a value (μ)
 * slider and a width (σ) slider; the chart above previews your path + ±σ band
 * against the consensus path and any live samples. Every σ is clamped to the
 * market's effective σ-floor.
 */
import { useEffect, useMemo, useState } from "react";

import { BeliefChart } from "@/components/forecast/belief-chart";
import { RangeSlider } from "@/components/forecast/range-slider";
import {
  clampSigma,
  effectiveSigmaFloor,
  fromWad,
  toWad,
} from "@/lib/curve";

export interface TrajectoryBelief {
  musWad: bigint[];
  sigmasWad: bigint[];
}

export interface TrajectoryBeliefInputProps {
  market: { kWad: bigint; bWad: bigint };
  /** Checkpoint x-values (consistent unit — e.g. unix seconds). */
  checkpoints: number[];
  /** Consensus mean per checkpoint (real units), aligned to `checkpoints`. */
  consensusMus: number[];
  /** Historical samples to show on the chart (e.g. the live BTC feed). */
  samples?: { x: number; y: number }[];
  disabled?: boolean;
  /** Emits whenever the belief changes; arrays are length == checkpoints, σ floored. */
  onChange: (belief: TrajectoryBelief) => void;
}

export function TrajectoryBeliefInput({
  market,
  checkpoints,
  consensusMus,
  samples,
  disabled,
  onChange,
}: TrajectoryBeliefInputProps) {
  const n = checkpoints.length;
  const floorReal = useMemo(
    () => Math.max(1e-12, fromWad(effectiveSigmaFloor(market.kWad, market.bWad))),
    [market.kWad, market.bWad],
  );

  // Value window across all references (consensus + samples), padded.
  const vals = [
    ...consensusMus.filter((v) => Number.isFinite(v) && v > 0),
    ...(samples ?? []).map((s) => s.y).filter((v) => Number.isFinite(v) && v > 0),
  ];
  const lo0 = vals.length ? Math.min(...vals) : 0;
  const hi0 = vals.length ? Math.max(...vals) : 1;
  const pad = Math.max((hi0 - lo0) * 0.4, hi0 * 0.02, floorReal * 8);
  const vMin = lo0 - pad;
  const vMax = hi0 + pad;
  const vStep = (vMax - vMin) / 200 || 1;
  const sigmaMin = floorReal;
  const sigmaMax = Math.max((vMax - vMin) / 2, floorReal * 16);
  const sigmaStep = (sigmaMax - sigmaMin) / 100 || 1;

  // Default each μ to the latest sample (or consensus), σ to a sane mid value.
  const seedMu = samples?.length ? samples[samples.length - 1].y : (consensusMus[0] ?? (vMin + vMax) / 2);
  const seedSigma = Math.max(sigmaMin, Math.min(sigmaMax, (hi0 - lo0) * 0.15 || sigmaMin * 4));

  const [musReal, setMusReal] = useState<number[]>(() => Array.from({ length: n }, () => seedMu));
  const [sigmasReal, setSigmasReal] = useState<number[]>(() => Array.from({ length: n }, () => seedSigma));

  // Re-seed when the checkpoint set changes — "adjust state during render" pattern.
  const cpKey = checkpoints.join(",");
  const [seededFrom, setSeededFrom] = useState(cpKey);
  if (seededFrom !== cpKey) {
    setSeededFrom(cpKey);
    setMusReal(Array.from({ length: n }, () => seedMu));
    setSigmasReal(Array.from({ length: n }, () => seedSigma));
  }

  const belief: TrajectoryBelief = useMemo(
    () => ({
      musWad: musReal.map((v) => toWad(v)),
      sigmasWad: sigmasReal.map((v) => clampSigma(toWad(Math.max(v, sigmaMin)), market)),
    }),
    [musReal, sigmasReal, sigmaMin, market],
  );

  useEffect(() => {
    onChange(belief);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [belief.musWad.map(String).join(","), belief.sigmasWad.map(String).join(",")]);

  const setMu = (i: number, v: number) => setMusReal((a) => a.map((x, j) => (j === i ? v : x)));
  const setSigma = (i: number, v: number) => setSigmasReal((a) => a.map((x, j) => (j === i ? v : x)));

  return (
    <div className="flex flex-col gap-3">
      <BeliefChart
        mode="trajectory"
        market={market}
        checkpoints={checkpoints}
        consensusMus={consensusMus}
        youMus={musReal}
        youSigmas={sigmasReal}
        samples={samples}
      />
      <div className="flex flex-col gap-3">
        {checkpoints.map((_, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-md border bg-card/50 p-2 sm:grid-cols-[auto_1fr_1fr]">
            <span className="self-center text-xs font-medium text-muted-foreground">#{i + 1}</span>
            <RangeSlider
              label="Value"
              ariaLabel={`Checkpoint ${i + 1} value`}
              value={musReal[i]}
              onChange={(v) => setMu(i, v)}
              min={vMin}
              max={vMax}
              step={vStep}
              disabled={disabled}
            />
            <RangeSlider
              label="Width (σ)"
              ariaLabel={`Checkpoint ${i + 1} width`}
              value={sigmasReal[i]}
              onChange={(v) => setSigma(i, v)}
              min={sigmaMin}
              max={sigmaMax}
              step={sigmaStep}
              format={(v) => `σ ≈ ${v >= 1 ? v.toFixed(2) : v.toPrecision(3)}`}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
