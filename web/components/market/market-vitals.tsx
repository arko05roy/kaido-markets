"use client";

import { useEffect, useState } from "react";

import { MetricChip } from "@/components/app/dashboard-page-header";
import { formatCountdown, formatUsdc7dp } from "@/lib/market-display";

export function MarketVitals({
  crowdTarget,
  closesAt,
  statusTag,
  blendBackedDepth7dp,
}: {
  crowdTarget?: string;
  closesAt: number;
  statusTag: string;
  blendBackedDepth7dp?: bigint;
}) {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const countdown = formatCountdown(closesAt, nowSec);
  const resolved = statusTag === "Resolved" || statusTag === "ResolvedVec";

  return (
    <div className="flex flex-wrap gap-2">
      {crowdTarget && <MetricChip label="Crowd" value={crowdTarget} accent />}
      <MetricChip label={resolved ? "Status" : "Closes in"} value={resolved ? "Settled" : countdown} />
      {blendBackedDepth7dp != null && blendBackedDepth7dp > 0n && (
        <MetricChip
          label="Blend depth"
          value={`${formatUsdc7dp(blendBackedDepth7dp)}`}
          className="min-w-[5.5rem]"
        />
      )}
    </div>
  );
}
