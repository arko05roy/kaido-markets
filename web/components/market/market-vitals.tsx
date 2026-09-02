"use client";

import { useEffect, useState } from "react";

import { formatCountdown } from "@/lib/market-display";

export function MarketVitals({
  crowdTarget,
  closesAt,
  statusTag,
}: {
  crowdTarget?: string;
  closesAt: number;
  statusTag: string;
}) {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const countdown = formatCountdown(closesAt, nowSec);
  const resolved = statusTag === "Resolved" || statusTag === "ResolvedVec";

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-white/10 py-4 font-mono text-[11px] uppercase tracking-[0.16em]">
      {crowdTarget && (
        <div>
          <span className="text-white/35">Crowd </span>
          <span className="text-[#d8c69a]">{crowdTarget}</span>
        </div>
      )}
      <div>
        <span className="text-white/35">{resolved ? "Resolved" : "Closes in"} </span>
        <span className="text-[#f3efe6]">{resolved ? "—" : countdown}</span>
      </div>
    </div>
  );
}
