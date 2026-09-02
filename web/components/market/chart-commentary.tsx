"use client";

import { edgeVsCrowd, formatOutcome } from "@/lib/market-display";
import { fromWad } from "@/lib/curve";
import type { GaussianBelief } from "@/lib/curve";

export function ChartCommentary({
  crowdMuWad,
  yourBelief,
}: {
  crowdMuWad: bigint;
  yourBelief?: GaussianBelief | null;
}) {
  if (!yourBelief) return null;

  const crowd = fromWad(crowdMuWad);
  const yours = fromWad(yourBelief.muWad);
  const crowdLabel = formatOutcome(crowd);
  const yourLabel = formatOutcome(yours);
  const { stance } = edgeVsCrowd(yours, crowd);

  return (
    <p className="px-1 text-sm text-white/50">
      Crowd thinks <span className="font-mono text-[#d8c69a]">{crowdLabel}</span>. You&apos;re
      calling <span className="font-mono text-[#f3efe6]">{yourLabel}</span>.{" "}
      <span className="text-white/65">{stance}.</span>
    </p>
  );
}
