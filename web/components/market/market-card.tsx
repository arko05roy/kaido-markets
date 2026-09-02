"use client";

import Link from "next/link";

import { ClosesIn } from "@/components/market/closes-in";
import { MarketCardMetadata } from "@/components/market/market-card-metadata";
import { MarketCardStats } from "@/components/market/market-card-stats";
import { useLedgerNow } from "@/components/providers/ledger-time-provider";
import { fromWad, sigmaFloor } from "@/lib/curve";
import {
  convictionFromSigma,
  convictionLabel,
  crowdTargetLabel,
  formatOutcome,
  formatUsdc7dp,
  statusLabel,
} from "@/lib/market-display";
import { displayMarketQuestion } from "@/lib/market-metadata";
import type { SavedMarketMetadata } from "@/lib/market-metadata";
import type { MarketStats24h } from "@/lib/market-stats";
import type { MarketCard } from "@/lib/market-types";
import { cn } from "@/lib/utils";

type CardTone = "open" | "locked" | "disputable" | "settled";

function cardTone(statusText: string): CardTone {
  switch (statusText) {
    case "Open":
      return "open";
    case "Locked":
      return "locked";
    case "Disputable":
      return "disputable";
    default:
      return "settled";
  }
}

function closingUrgency(lockSec: number, nowSec: number): "hot" | "warm" | null {
  const remaining = lockSec - nowSec;
  if (remaining <= 0 || remaining > 86_400) return null;
  return remaining <= 3_600 ? "hot" : "warm";
}

function useClosingUrgency(lockSec: number, enabled: boolean): "hot" | "warm" | null {
  const { nowSec } = useLedgerNow();
  if (!enabled) return null;
  return closingUrgency(lockSec, nowSec);
}

function crowdConviction(card: MarketCard): string | null {
  const { crowdSigmaWad, crowdMuWad, kWad, bWad } = card;
  if (crowdSigmaWad == null || kWad == null || bWad == null) return null;
  const sigmaMin = Math.max(1e-12, fromWad(sigmaFloor(kWad, bWad)));
  const sigmaReal = fromWad(crowdSigmaWad);
  const mu = crowdMuWad != null ? fromWad(crowdMuWad) : 100;
  const sigmaMax = Math.max(Math.abs(mu) * 0.2, sigmaMin * 16);
  return convictionLabel(convictionFromSigma(sigmaReal, sigmaMin, sigmaMax));
}

function resolvedOutcome(card: MarketCard): string | null {
  const { status } = card;
  if (!status || status.tag !== "Resolved") return null;
  const raw = status.values[0];
  if (raw == null) return null;
  return formatOutcome(fromWad(BigInt(raw)));
}

function resolvedOutcomeRaw(card: MarketCard): number | null {
  const { status } = card;
  if (!status || status.tag !== "Resolved") return null;
  const raw = status.values[0];
  if (raw == null) return null;
  return fromWad(BigInt(raw));
}

type RangeRailData = {
  zoneLeft: number;
  zoneRight: number;
  muPct: number;
  outcomePct: number | null;
  minLabel: string;
  maxLabel: string;
};

function buildRangeRail(card: MarketCard): RangeRailData | null {
  const { crowdMuWad, crowdSigmaWad } = card;
  if (crowdMuWad == null || crowdSigmaWad == null) return null;

  const mu = fromWad(crowdMuWad);
  const sigma = Math.max(1e-12, fromWad(crowdSigmaWad));
  const min = mu - 3 * sigma;
  const max = mu + 3 * sigma;
  const span = Math.max(max - min, 1e-9);

  const toPct = (v: number) => Math.min(100, Math.max(0, ((v - min) / span) * 100));
  const outcome = resolvedOutcomeRaw(card);

  return {
    zoneLeft: toPct(mu - sigma),
    zoneRight: toPct(mu + sigma),
    muPct: toPct(mu),
    outcomePct: outcome != null ? toPct(outcome) : null,
    minLabel: formatOutcome(min),
    maxLabel: formatOutcome(max),
  };
}

/** Crowd belief zone on an outcome rail — Kaido's signature, not a chart. */
function RangeRail({
  rail,
  tone,
  crowd,
  size = "default",
}: {
  rail: RangeRailData;
  tone: CardTone;
  crowd: string;
  size?: "default" | "large";
}) {
  const live = tone === "open";
  const settled = tone === "settled";
  const large = size === "large";

  return (
    <div className={cn("space-y-2", large && "space-y-3")}>
      <div className={cn("relative w-full", large ? "h-14" : "h-9")} aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.1]" />
        {live && (
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 rounded-full blur-md",
              large ? "h-5" : "h-3",
            )}
            style={{
              left: `${rail.zoneLeft}%`,
              width: `${Math.max(rail.zoneRight - rail.zoneLeft, 1)}%`,
              background: "rgba(216,198,154,0.12)",
            }}
          />
        )}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-full",
            large ? "h-3" : "h-2",
            live ? "bg-[#d8c69a]/35" : settled ? "bg-white/[0.08]" : "bg-[#d8c69a]/18",
          )}
          style={{
            left: `${rail.zoneLeft}%`,
            width: `${Math.max(rail.zoneRight - rail.zoneLeft, 1)}%`,
          }}
        />
        <div
          className={cn(
            "absolute w-px",
            large ? "top-0 bottom-3" : "top-0 bottom-2",
            live ? "bg-[#d8c69a]" : "bg-[#d8c69a]/55",
          )}
          style={{ left: `${rail.muPct}%` }}
        />
        {rail.outcomePct != null && (
          <div
            className={cn(
              "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f3efe6]/80 bg-[#f3efe6] shadow-[0_0_10px_rgba(243,239,230,0.35)]",
              large ? "h-3 w-3" : "h-2 w-2",
            )}
            style={{ left: `${rail.outcomePct}%` }}
          />
        )}
      </div>
      <div
        className={cn(
          "flex items-end justify-between gap-2 font-mono tabular-nums tracking-tight",
          large ? "text-[11px]" : "text-[10px]",
        )}
      >
        <span className="text-white/25">{rail.minLabel}</span>
        <span className={cn(large ? "text-xs" : "text-[11px]", live ? "text-[#d8c69a]" : "text-white/45")}>
          {settled && rail.outcomePct != null ? "Settled" : "Crowd"} · {crowd}
        </span>
        <span className="text-white/25">{rail.maxLabel}</span>
      </div>
    </div>
  );
}

function toneBorder(tone: CardTone): string {
  switch (tone) {
    case "open":
      return "border-l-[#d8c69a]/55";
    case "locked":
      return "border-l-amber-500/45";
    case "disputable":
      return "border-l-orange-500/45";
    default:
      return "border-l-white/[0.08]";
  }
}

export function MarketCardItem({
  card,
  metadata,
  stats,
  variant = "default",
  className,
  style,
}: {
  card: MarketCard;
  metadata?: SavedMarketMetadata;
  stats?: MarketStats24h;
  variant?: "default" | "featured";
  className?: string;
  style?: React.CSSProperties;
}) {
  const { address, info, status, crowdMuWad, blendBackedDepth7dp } = card;
  const statusText = statusLabel(status);
  const tone = cardTone(statusText);
  const lockSec = Number(info.window.lock);
  const title = displayMarketQuestion(info, crowdMuWad, metadata?.question);
  const crowd = crowdMuWad != null ? crowdTargetLabel(crowdMuWad) : null;
  const outcome = resolvedOutcome(card);
  const conviction = crowdConviction(card);
  const urgency = useClosingUrgency(lockSec, tone === "open");
  const rail = buildRangeRail(card);
  const tradable = tone === "open";
  const featured = variant === "featured";

  return (
    <Link
      href={`/markets/${address}`}
      className={cn("group block h-full", className)}
      style={style}
    >
      <article
        className={cn(
          "relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1c1c21]",
          "border-l-[3px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
          "transition-[border-color,background-color,box-shadow] duration-250 ease-out",
          "motion-safe:group-hover:border-[#d8c69a]/16 motion-safe:group-hover:bg-[#1f1f25]",
          "motion-safe:group-hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.55)]",
          "focus-within:outline-none focus-within:ring-2 focus-within:ring-[#d8c69a]/35 focus-within:ring-offset-2 focus-within:ring-offset-[#141416]",
          toneBorder(tone),
          tone === "settled" && "opacity-[0.92]",
          featured &&
            "border-[#d8c69a]/20 shadow-[0_0_80px_-20px_rgba(216,198,154,0.3)] motion-safe:group-hover:shadow-[0_0_100px_-16px_rgba(216,198,154,0.35)]",
        )}
      >
        {featured && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(216,198,154,0.09),transparent_60%)]" />
        )}
        <div
          className={cn(
            "relative flex flex-1 flex-col gap-4",
            featured ? "p-6 sm:p-8 lg:grid lg:grid-cols-[1fr_minmax(0,42%)] lg:items-center lg:gap-8" : "p-5 sm:p-6",
          )}
        >
          {featured ? (
            <>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]/80 lg:col-span-2">
                Spotlight · highest activity
              </span>
              <div className="flex flex-col gap-4">
                {/* meta row */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {tone === "open" && (
                      <span className="relative flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300/90">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </span>
                        Open
                      </span>
                    )}
                    {tone !== "open" && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                        {statusText}
                      </span>
                    )}
                    {info.capped && <span className="text-[#d8c69a]/70">·</span>}
                    {info.capped && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#d8c69a]/70">
                        Capped
                      </span>
                    )}
                    {blendBackedDepth7dp != null && blendBackedDepth7dp > 0n && (
                      <>
                        <span className="text-white/20">·</span>
                        <span className="font-mono text-[10px] text-emerald-300/75">
                          Blend {formatUsdc7dp(blendBackedDepth7dp)} USDC
                        </span>
                      </>
                    )}
                  </div>
                  {tone === "open" && (
                    <div className="text-right">
                      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">
                        Closes in
                      </p>
                      <p
                        className={cn(
                          "font-mono text-sm tabular-nums",
                          urgency === "hot" ? "text-amber-300" : "text-[#f3efe6]",
                        )}
                      >
                        <ClosesIn at={lockSec} />
                      </p>
                    </div>
                  )}
                </div>

                <h2 className="font-serif text-[1.5rem] leading-[1.15] tracking-[-0.02em] text-[#f3efe6] sm:text-[1.75rem] lg:text-[2rem]">
                  {title}
                </h2>

                <MarketCardStats stats={stats} variant="chips" />

                {tone === "settled" && outcome && (
                  <p className="font-mono text-[11px] text-white/40">
                    Oracle settled at <span className="text-[#f3efe6]/80">{outcome}</span>
                  </p>
                )}

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.05] pt-4 lg:mt-2">
                  <div className="min-w-0">
                    {conviction && tone !== "settled" ? (
                      <p className="font-mono text-[11px] text-white/40">
                        Crowd conviction{" "}
                        <span className="text-[#d8c69a]/90">{conviction}</span>
                      </p>
                    ) : tone === "settled" && crowd ? (
                      <p className="font-mono text-[11px] text-white/35">
                        Crowd called <span className="text-white/55">{crowd}</span>
                      </p>
                    ) : (
                      <p className="font-mono text-[11px] text-white/30">On-chain market</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <MarketCardMetadata address={address} info={info} />
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]",
                        "transition-[color,gap] duration-200 group-hover:gap-2.5",
                        tradable
                          ? "text-[#d8c69a] group-hover:text-[#f3efe6]"
                          : "text-white/40 group-hover:text-white/60",
                      )}
                    >
                      {tradable ? "Trade range" : "View market"}
                      <span
                        aria-hidden
                        className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
                      >
                        →
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-center">
                {rail && crowd ? (
                  <RangeRail rail={rail} tone={tone} crowd={crowd} size="large" />
                ) : crowd ? (
                  <p className="font-mono text-sm text-white/50">
                    Crowd call <span className="text-[#d8c69a]">{crowd}</span>
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <>
              {/* meta row */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {tone === "open" && (
                <span className="relative flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300/90">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Open
                </span>
              )}
              {tone !== "open" && (
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                  {statusText}
                </span>
              )}
              {info.capped && (
                <span className="text-[#d8c69a]/70">·</span>
              )}
              {info.capped && (
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#d8c69a]/70">
                  Capped
                </span>
              )}
              {blendBackedDepth7dp != null && blendBackedDepth7dp > 0n && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="font-mono text-[10px] text-emerald-300/75">
                    Blend {formatUsdc7dp(blendBackedDepth7dp)} USDC
                  </span>
                </>
              )}
            </div>
            {tone === "open" && (
              <div className="text-right">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">
                  Closes in
                </p>
                <p
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    urgency === "hot" ? "text-amber-300" : "text-[#f3efe6]",
                  )}
                >
                  <ClosesIn at={lockSec} />
                </p>
              </div>
            )}
          </div>

          <h2 className="font-serif text-[1.2rem] leading-[1.15] tracking-[-0.02em] text-[#f3efe6] sm:text-[1.35rem]">
            {title}
          </h2>

          {rail && crowd ? (
            <RangeRail rail={rail} tone={tone} crowd={crowd} />
          ) : crowd ? (
            <p className="font-mono text-sm text-white/50">
              Crowd call <span className="text-[#d8c69a]">{crowd}</span>
            </p>
          ) : null}

          <MarketCardStats stats={stats} />

          {tone === "settled" && outcome && (
            <p className="font-mono text-[11px] text-white/40">
              Oracle settled at <span className="text-[#f3efe6]/80">{outcome}</span>
            </p>
          )}

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.05] pt-4">
            <div className="min-w-0">
              {conviction && tone !== "settled" ? (
                <p className="font-mono text-[11px] text-white/40">
                  Crowd conviction{" "}
                  <span className="text-[#d8c69a]/90">{conviction}</span>
                </p>
              ) : tone === "settled" && crowd ? (
                <p className="font-mono text-[11px] text-white/35">
                  Crowd called <span className="text-white/55">{crowd}</span>
                </p>
              ) : (
                <p className="font-mono text-[11px] text-white/30">On-chain market</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <MarketCardMetadata address={address} info={info} />
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]",
                  "transition-[color,gap] duration-200 group-hover:gap-2.5",
                  tradable
                    ? "text-[#d8c69a] group-hover:text-[#f3efe6]"
                    : "text-white/40 group-hover:text-white/60",
                )}
              >
                {tradable ? "Trade range" : "View market"}
                <span
                  aria-hidden
                  className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </span>
            </div>
          </div>
            </>
          )}
        </div>
      </article>
    </Link>
  );
}

export function partitionMarkets(markets: MarketCard[]): {
  live: MarketCard[];
  settled: MarketCard[];
} {
  const live: MarketCard[] = [];
  const settled: MarketCard[] = [];
  for (const card of markets) {
    if (cardTone(statusLabel(card.status)) !== "settled") live.push(card);
    else settled.push(card);
  }
  return { live, settled };
}
