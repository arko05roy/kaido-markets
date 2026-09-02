"use client";

import { useEffect, useMemo, useState } from "react";

import { BeliefChart } from "@/components/forecast/belief-chart";
import { RangeSlider } from "@/components/forecast/range-slider";
import { SnappySlider } from "@/components/ui/snappy-slider";
import {
  convictionFromSigma,
  convictionHint,
  convictionLabel,
  edgeVsCrowd,
  formatOutcome,
} from "@/lib/market-display";
import {
  clampSigma,
  effectiveSigmaFloor,
  fromWad,
  toWad,
  type GaussianBelief,
} from "@/lib/curve";
import { cn } from "@/lib/utils";

export interface ScalarBeliefInputProps {
  market: { kWad: bigint; bWad: bigint; capped?: boolean };
  consensus: GaussianBelief;
  range?: { min: number; max: number };
  disabled?: boolean;
  onChange: (belief: GaussianBelief) => void;
}

export function ScalarBeliefInput({ market, consensus, range, disabled, onChange }: ScalarBeliefInputProps) {
  const floorReal = useMemo(
    () => Math.max(1e-12, fromWad(effectiveSigmaFloor(market.kWad, market.bWad))),
    [market.kWad, market.bWad],
  );
  const cMu = fromWad(consensus.muWad);
  const cSigma = Math.max(floorReal, fromWad(consensus.sigmaWad));

  // X/Y frame is pinned to the crowd — only your curve moves when sliders change.
  const chartRange = useMemo(
    () =>
      range ?? {
        min: cMu - 5 * cSigma,
        max: cMu + 5 * cSigma,
      },
    [range, cMu, cSigma],
  );
  const win = chartRange;
  const span = Math.max(win.max - win.min, floorReal * 8);
  const muStep = span / 200;
  const sigmaMin = floorReal;
  const sigmaMax = Math.max(span / 2, floorReal * 16);
  const sigmaStep = (sigmaMax - sigmaMin) / 100;

  const [muReal, setMuReal] = useState(cMu);
  const [sigmaReal, setSigmaReal] = useState(cSigma);

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

  const edge = edgeVsCrowd(muReal, cMu);
  const conviction = convictionFromSigma(sigmaReal, sigmaMin, sigmaMax);
  // UI maps wide (left) ↔ tight/sniper (right); σ increases toward wide.
  const convictionUi = sigmaMax - sigmaReal + sigmaMin;

  const convictionSnapValues = useMemo(() => {
    const span = sigmaMax - sigmaMin;
    const toUi = (sigma: number) => sigmaMax - sigma + sigmaMin;
    return [
      toUi(sigmaMax),
      toUi(sigmaMin + 0.75 * span),
      toUi(sigmaMin + 0.5 * span),
      toUi(sigmaMin + 0.25 * span),
      toUi(sigmaMin),
    ];
  }, [sigmaMin, sigmaMax]);

  return (
    <div className="flex flex-col gap-5">
      <BeliefChart
        mode="scalar"
        market={market}
        range={chartRange}
        consensus={consensus}
        you={belief}
        anchorYToConsensus
      />

      <div className="space-y-1">
        <RangeSlider
          label="Your call"
          value={muReal}
          onChange={setMuReal}
          min={win.min}
          max={win.max}
          step={muStep || 1}
          disabled={disabled}
          format={formatOutcome}
          prominent
        />
        <p className="text-center font-mono text-xs text-white/45">
          {edge.deltaLabel}
          <span className="mx-2 text-white/20">·</span>
          {edge.pctLabel}
        </p>
      </div>

      <div className="space-y-1">
        <SnappySlider
          label="Conviction"
          tone="kaido"
          values={convictionSnapValues}
          defaultValue={convictionUi}
          value={convictionUi}
          onChange={(v) => setSigmaReal(sigmaMax - v + sigmaMin)}
          min={sigmaMin}
          max={sigmaMax}
          step={sigmaStep || 1}
          snapping
          config={{
            snappingThreshold: (sigmaMax - sigmaMin) * 0.04,
            labelFormatter: (ui) =>
              convictionLabel(convictionFromSigma(sigmaMax - ui + sigmaMin, sigmaMin, sigmaMax)),
          }}
          className={cn(disabled && "pointer-events-none opacity-50")}
        />
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">
          <span>Wide</span>
          <span>Tight</span>
        </div>
        <p className="text-[11px] text-white/40">{convictionHint(conviction)}</p>
        <p className="text-[11px] text-white/35">
          Tighter = more upside, less room to miss. Wider = safer range, lower upside.
        </p>
      </div>
    </div>
  );
}
