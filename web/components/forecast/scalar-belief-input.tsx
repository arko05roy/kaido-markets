"use client";

/**
 * ScalarBeliefInput — set a scalar Gaussian belief `(μ, σ)` with two sliders and
 * a live preview (no freehand drawing). σ is always clamped to the market's
 * effective σ-floor so the contract's `peak ≤ b` re-check can't reject it. The
 * preview renders the *exact* curve that will be submitted (ADR-8).
 */
import { useEffect, useMemo, useState } from "react";

import { BeliefChart } from "@/components/forecast/belief-chart";
import { RangeSlider } from "@/components/forecast/range-slider";
import {
  clampSigma,
  effectiveSigmaFloor,
  fromWad,
  toWad,
  type GaussianBelief,
} from "@/lib/curve";

export interface ScalarBeliefInputProps {
  market: { kWad: bigint; bWad: bigint };
  /** Current consensus belief — the preview shows it faintly, and it's the default. */
  consensus: GaussianBelief;
  /** Optional explicit outcome-value window (real units); else derived from the consensus. */
  range?: { min: number; max: number };
  disabled?: boolean;
  /** Called whenever the belief changes; always emits a σ ≥ the effective floor. */
  onChange: (belief: GaussianBelief) => void;
}

export function ScalarBeliefInput({ market, consensus, range, disabled, onChange }: ScalarBeliefInputProps) {
  const floorReal = useMemo(
    () => Math.max(1e-12, fromWad(effectiveSigmaFloor(market.kWad, market.bWad))),
    [market.kWad, market.bWad],
  );
  const cMu = fromWad(consensus.muWad);
  const cSigma = Math.max(floorReal, fromWad(consensus.sigmaWad));

  // x-axis window: explicit, else consensus μ ± ~5σ (with a floor on the half-width).
  const win = range ?? {
    min: cMu - 5 * cSigma,
    max: cMu + 5 * cSigma,
  };
  const span = Math.max(win.max - win.min, floorReal * 8);
  const muStep = span / 200;
  const sigmaMin = floorReal;
  const sigmaMax = Math.max(span / 2, floorReal * 16);
  const sigmaStep = (sigmaMax - sigmaMin) / 100;

  const [muReal, setMuReal] = useState(cMu);
  const [sigmaReal, setSigmaReal] = useState(cSigma);

  // Re-seed when the consensus belief identity changes (e.g. a new market loads)
  // — the React-blessed "adjust state during render" pattern (no setState-in-effect).
  const [seededFrom, setSeededFrom] = useState(`${consensus.muWad}:${consensus.sigmaWad}`);
  const key = `${consensus.muWad}:${consensus.sigmaWad}`;
  if (seededFrom !== key) {
    setSeededFrom(key);
    setMuReal(cMu);
    setSigmaReal(cSigma);
  }

  const belief: GaussianBelief = useMemo(() => {
    const muWad = toWad(muReal);
    const sigmaWad = clampSigma(toWad(Math.max(sigmaReal, sigmaMin)), market);
    return { muWad, sigmaWad };
  }, [muReal, sigmaReal, sigmaMin, market]);

  useEffect(() => {
    onChange(belief);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [belief.muWad, belief.sigmaWad]);

  return (
    <div className="flex flex-col gap-3">
      <BeliefChart mode="scalar" market={market} range={win} consensus={consensus} you={belief} />
      <RangeSlider
        label="Center (μ) — where you think it lands"
        value={muReal}
        onChange={setMuReal}
        min={win.min}
        max={win.max}
        step={muStep || 1}
        disabled={disabled}
      />
      <RangeSlider
        label="Width (σ) — how spread your belief is"
        hint="left = tight / confident (at the market's σ-min) · right = wide / unsure"
        value={sigmaReal}
        onChange={setSigmaReal}
        min={sigmaMin}
        max={sigmaMax}
        step={sigmaStep || 1}
        format={(v) => `σ ≈ ${v >= 1 ? v.toFixed(2) : v.toPrecision(3)}`}
        disabled={disabled}
      />
    </div>
  );
}
