import Link from "next/link";

import { StatusPill } from "@/components/app/kaido-ui";
import { MarketVitals } from "@/components/market/market-vitals";
import { cn } from "@/lib/utils";

export function MarketDetailHeader({
  backHref = "/markets",
  backLabel = "All markets",
  title,
  subtitle,
  status,
  crowdTarget,
  closesAt,
  statusTag,
  blendBackedDepth7dp,
  volumeUsdc,
  crowdMovedPct,
  className,
}: {
  backHref?: string;
  backLabel?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  status: string;
  crowdTarget?: string;
  closesAt: number;
  statusTag: string;
  blendBackedDepth7dp?: bigint;
  volumeUsdc?: number;
  crowdMovedPct?: number;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1c1c21]",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.09),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.04),transparent_65%)]" />

      <div className="relative border-b border-white/[0.06] px-4 py-2.5 sm:px-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/40 transition-colors hover:text-[#f3efe6]"
        >
          <span aria-hidden>←</span>
          {backLabel}
        </Link>
      </div>

      <div className="relative space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusPill label={status} />
            </div>
            <h1 className="font-serif text-[clamp(1.35rem,3.5vw,2.25rem)] leading-[1.12] tracking-[-0.03em] text-[#f3efe6]">
              {title}
            </h1>
            {subtitle && (
              <p className="max-w-[58ch] text-sm leading-relaxed text-white/45">{subtitle}</p>
            )}
          </div>
        </div>
      </div>

      <div className="relative border-t border-white/[0.06] px-5 py-4 sm:px-6">
        <MarketVitals
          crowdTarget={crowdTarget}
          closesAt={closesAt}
          statusTag={statusTag}
          blendBackedDepth7dp={blendBackedDepth7dp}
          volumeUsdc={volumeUsdc}
          crowdMovedPct={crowdMovedPct}
        />
      </div>
    </header>
  );
}
