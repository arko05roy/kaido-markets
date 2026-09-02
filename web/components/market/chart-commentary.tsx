"use client";

import { edgeVsCrowd, formatBeliefMu } from "@/lib/market-display";
import { fromWad } from "@/lib/curve";
import type { GaussianBelief } from "@/lib/curve";
import type { OutcomeConfig } from "@/lib/outcome-scale";

export function ChartCommentary({
  crowdMuWad,
  yourBelief,
  outcomeConfig,
}: {
  crowdMuWad: bigint;
  yourBelief?: GaussianBelief | null;
  outcomeConfig?: OutcomeConfig | null;
}) {
  if (!yourBelief) return null;

  const crowd = fromWad(crowdMuWad);
  const yours = fromWad(yourBelief.muWad);
  const crowdLabel = formatBeliefMu(crowd, outcomeConfig);
  const yourLabel = formatBeliefMu(yours, outcomeConfig);
  const { stance } = edgeVsCrowd(yours, crowd);

  return (
    <div className="rounded-xl border border-[#d8c69a]/20 bg-[#d8c69a]/[0.06] px-4 py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#d8c69a]/75">
        Your edge vs crowd
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-white/55">
        Crowd thinks{" "}
        <span className="font-mono text-[#d8c69a]">{crowdLabel}</span>. You&apos;re calling{" "}
        <span className="font-mono text-[#f3efe6]">{yourLabel}</span>.{" "}
        <span className="text-white/70">{stance}.</span>
      </p>
    </div>
  );
}
