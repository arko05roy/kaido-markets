"use client";

import { useEffect, useState } from "react";

import { formatCountdown } from "@/lib/market-display";

export function ClosesIn({ at }: { at: number }) {
  const [nowSec, setNowSec] = useState<number | null>(null);

  useEffect(() => {
    setNowSec(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const label = nowSec == null ? "…" : formatCountdown(at, nowSec);

  return <span className="text-[#f3efe6]">{label}</span>;
}
