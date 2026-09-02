"use client";

import { type ReactNode } from "react";

/**
 * Trading-venue layout: chart + commentary on the left, sticky trade ticket on desktop.
 */
export function MarketTradingLayout({
  header,
  vitals,
  chart,
  chartLabel,
  ticket,
  below,
}: {
  header: ReactNode;
  vitals?: ReactNode;
  chart: ReactNode;
  chartLabel?: string;
  ticket: ReactNode;
  below?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      {header}
      {vitals}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start lg:gap-8">
        <div className="space-y-6 min-w-0">
          <section className="space-y-3 min-w-0">
            {chartLabel && (
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]">
                {chartLabel}
              </p>
            )}
            {chart}
          </section>
          {below}
        </div>
        <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">{ticket}</div>
      </div>
    </div>
  );
}
