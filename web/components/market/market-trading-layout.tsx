"use client";

import { type ReactNode } from "react";

/**
 * Trading-venue layout: belief surface on the left, sticky trade ticket on desktop.
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start lg:gap-8">
      <div className="min-w-0 space-y-5">
        <section className="min-w-0">
          {chartLabel && (
            <div className="mb-3 flex items-center gap-3 px-1">
              <span className="h-px w-8 bg-[#d8c69a]/45" aria-hidden />
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]/85">
                {chartLabel}
              </p>
            </div>
          )}
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-3 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(216,198,154,0.05),transparent_72%)]"
            />
            {chart}
          </div>
        </section>
        {below}
      </div>
      <div className="min-w-0 lg:sticky lg:top-[4.75rem] lg:self-start">{ticket}</div>
    </div>
  );
}
