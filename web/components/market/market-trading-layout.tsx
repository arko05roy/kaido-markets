"use client";

import { type ReactNode } from "react";

/**
 * Trading-venue layout: chart + commentary on the left, sticky trade ticket on desktop.
 */
export function MarketTradingLayout({
  chart,
  chartLabel,
  ticket,
  below,
}: {
  chart: ReactNode;
  chartLabel?: string;
  ticket: ReactNode;
  below?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start lg:gap-6">
      <div className="min-w-0 space-y-5">
        <section className="min-w-0 space-y-3">
          {chartLabel && (
            <p className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              {chartLabel}
            </p>
          )}
          {chart}
        </section>
        {below}
      </div>
      <div className="min-w-0 lg:sticky lg:top-[4.75rem] lg:self-start">{ticket}</div>
    </div>
  );
}
