"use client";

import { useLedgerNow } from "@/components/providers/ledger-time-provider";
import { formatCountdown } from "@/lib/market-display";

export function ClosesIn({ at }: { at: number }) {
  const { nowSec } = useLedgerNow();
  return <span className="text-[#f3efe6]">{formatCountdown(at, nowSec)}</span>;
}
