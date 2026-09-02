"use client";

import Link from "next/link";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Lock,
} from "lucide-react";
import * as React from "react";

import { ClosesIn } from "@/components/market/closes-in";
import { useLedgerNow } from "@/components/providers/ledger-time-provider";
import { Button } from "@/components/ui/button";
import { fromWad, sigmaFloor } from "@/lib/curve";
import {
  convictionFromSigma,
  convictionLabel,
  crowdTargetLabel,
  formatBeliefMu,
  formatUsdc7dp,
  statusLabel,
  tierLabel,
} from "@/lib/market-display";
import { displayMarketQuestion, outcomeConfigFromMetadata } from "@/lib/market-metadata";
import type { OutcomeConfig } from "@/lib/outcome-scale";
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

function resolvedOutcome(card: MarketCard, config: OutcomeConfig | null): string | null {
  const { status } = card;
  if (!status || status.tag !== "Resolved") return null;
  const raw = status.values[0];
  if (raw == null) return null;
  return formatBeliefMu(fromWad(BigInt(raw)), config);
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

function buildRangeRail(card: MarketCard, config: OutcomeConfig | null): RangeRailData | null {
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
    minLabel: formatBeliefMu(min, config),
    maxLabel: formatBeliefMu(max, config),
  };
}

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
        <div className="kaido-grain-track bg-border/40 absolute inset-x-0 top-1/2 h-px -translate-y-1/2" />
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
            "kaido-grain-fill absolute top-1/2 -translate-y-1/2 rounded-full",
            large ? "h-3" : "h-2",
            live ? "bg-primary/35" : settled ? "bg-muted" : "bg-primary/18",
          )}
          style={{
            left: `${rail.zoneLeft}%`,
            width: `${Math.max(rail.zoneRight - rail.zoneLeft, 1)}%`,
          }}
        />
        <div
          className={cn(
            "bg-primary absolute w-px",
            large ? "top-0 bottom-3" : "top-0 bottom-2",
            live ? "opacity-100" : "opacity-55",
          )}
          style={{ left: `${rail.muPct}%` }}
        />
        {rail.outcomePct != null && (
          <div
            className={cn(
              "bg-foreground border-foreground/80 absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-sm",
              large ? "h-3 w-3" : "h-2 w-2",
            )}
            style={{ left: `${rail.outcomePct}%` }}
          />
        )}
      </div>
      <div
        className={cn(
          "text-muted-foreground flex items-end justify-between gap-2 font-mono tabular-nums tracking-tight",
          large ? "text-[11px]" : "text-[10px]",
        )}
      >
        <span>{rail.minLabel}</span>
        <span className={cn(large ? "text-xs" : "text-[11px]", live && "text-primary")}>
          {settled && rail.outcomePct != null ? "Settled" : "Crowd"} · {crowd}
        </span>
        <span>{rail.maxLabel}</span>
      </div>
    </div>
  );
}

function toneIcon(tone: CardTone) {
  switch (tone) {
    case "open":
      return Activity;
    case "locked":
      return Lock;
    case "disputable":
      return AlertCircle;
    default:
      return CheckCircle2;
  }
}

function fmtVol(usdc: number): string {
  if (usdc >= 1_000_000) return `$${(usdc / 1_000_000).toFixed(1)}M`;
  if (usdc >= 1_000) return `$${(usdc / 1_000).toFixed(1)}k`;
  return `$${usdc.toFixed(0)}`;
}

function MarketCardStatsGrid({ stats }: { stats?: MarketStats24h }) {
  if (!stats) return null;

  const left =
    stats.volumeUsdc != null
      ? { label: "24h Volume", value: fmtVol(stats.volumeUsdc) }
      : stats.crowdMovedPct != null
        ? {
            label: "Crowd moved",
            value: `${stats.crowdMovedPct >= 0 ? "+" : ""}${stats.crowdMovedPct.toFixed(1)}%`,
          }
        : null;

  const right =
    stats.traderCount != null
      ? { label: "Traders", value: String(stats.traderCount) }
      : stats.crowdMovedPct != null && stats.volumeUsdc != null
        ? {
            label: "Crowd moved",
            value: `${stats.crowdMovedPct >= 0 ? "+" : ""}${stats.crowdMovedPct.toFixed(1)}%`,
          }
        : null;

  if (!left && !right) return null;

  return (
    <div
      className="mt-4 grid grid-cols-2 gap-4 border-t border-dashed pt-4"
      aria-label="Market stats"
    >
      {left ? (
        <div>
          <p className="text-muted-foreground text-sm">{left.label}</p>
          <p className="text-3xl leading-tight font-semibold tabular-nums">{left.value}</p>
        </div>
      ) : (
        <div />
      )}
      {right ? (
        <div className="text-right">
          <p className="text-muted-foreground text-sm">{right.label}</p>
          <p className="text-3xl leading-tight font-semibold tabular-nums">{right.value}</p>
        </div>
      ) : null}
    </div>
  );
}

function MarketCardDetails({
  card,
  tone,
  lockSec,
  conviction,
  outcome,
  crowd,
  urgency,
}: {
  card: MarketCard;
  tone: CardTone;
  lockSec: number;
  conviction: string | null;
  outcome: string | null;
  crowd: string | null;
  urgency: "hot" | "warm" | null;
}) {
  const [open, setOpen] = React.useState(false);
  const contentId = React.useId();
  const { address, info, blendBackedDepth7dp } = card;

  const rows: { label: string; value: string; hot?: boolean }[] = [
    { label: "Status", value: statusLabel(card.status) },
  ];

  if (tone === "open") {
    rows.push({
      label: "Closes in",
      value: "",
      hot: urgency === "hot",
    });
  }
  if (conviction && tone !== "settled") {
    rows.push({ label: "Conviction", value: conviction });
  }
  if (outcome) {
    rows.push({ label: "Settled at", value: outcome });
  } else if (crowd && tone === "settled") {
    rows.push({ label: "Crowd called", value: crowd });
  }
  if (info.capped) {
    rows.push({ label: "Pool", value: "Capped" });
  }
  if (blendBackedDepth7dp != null && blendBackedDepth7dp > 0n) {
    rows.push({ label: "Blend depth", value: `${formatUsdc7dp(blendBackedDepth7dp)} USDC` });
  }
  rows.push({
    label: "Type",
    value: info.outcome_space.tag === "Trajectory" ? "Path market" : "Range market",
  });
  rows.push({ label: "Oracle", value: tierLabel(info.tier) });

  return (
    <div className="mt-4 border-t pt-4">
      <button
        type="button"
        className="bg-muted flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-transform active:scale-[0.98]"
        onClick={(e) => {
          e.preventDefault();
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="text-lg font-semibold">Market details</span>
        <ChevronDown
          className={cn(
            "text-muted-foreground h-5 w-5 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id={contentId} className="space-y-3 px-2 pt-4">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground text-sm">{row.label}</span>
              <span
                className={cn(
                  "text-right text-sm font-medium tabular-nums",
                  row.hot && "text-amber-400",
                )}
              >
                {row.label === "Closes in" ? <ClosesIn at={lockSec} /> : row.value}
              </span>
            </div>
          ))}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              void navigator.clipboard.writeText(address);
            }}
            className="text-primary hover:text-foreground flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-2 text-sm font-medium transition-[color,border-color,transform] duration-150 active:scale-[0.98]"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy contract
          </button>
        </div>
      )}
    </div>
  );
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
  const { address, info, status, crowdMuWad } = card;
  const statusText = statusLabel(status);
  const tone = cardTone(statusText);
  const lockSec = Number(info.window.lock);
  const title = displayMarketQuestion(info, crowdMuWad, metadata?.question);
  const outcomeConfig = outcomeConfigFromMetadata(metadata);
  const crowd = crowdMuWad != null ? crowdTargetLabel(crowdMuWad, outcomeConfig) : null;
  const outcome = resolvedOutcome(card, outcomeConfig);
  const conviction = crowdConviction(card);
  const urgency = useClosingUrgency(lockSec, tone === "open");
  const rail = buildRangeRail(card, outcomeConfig);
  const tradable = tone === "open";
  const featured = variant === "featured";
  const Icon = toneIcon(tone);
  const actionLabel = tradable ? "Trade range" : "View market";
  const heroValue = outcome ?? crowd ?? statusText;
  const heroSuffix =
    outcome != null ? "settled" : crowd != null ? "crowd" : tone === "open" ? "live" : "";

  return (
    <Link
      href={`/markets/${address}`}
      className={cn(
        "group block h-full transition-transform duration-150 active:scale-[0.99]",
        className,
      )}
      style={style}
    >
      <section
        aria-label={`${title} market card`}
        className={cn(
          "bg-card relative flex h-full flex-col overflow-hidden rounded-2xl border p-6 shadow-sm transition-[box-shadow,border-color] duration-200",
          "group-hover:border-primary/20 group-hover:shadow-md",
          featured && "border-primary/20 shadow-[0_0_80px_-20px_rgba(216,198,154,0.25)]",
        )}
      >
        <div aria-hidden className="kaido-grain pointer-events-none absolute inset-0 rounded-2xl" />

        <div className="relative flex h-full flex-col">
          {featured && (
            <p className="text-primary mb-3 font-mono text-[10px] uppercase tracking-[0.22em]">
              Spotlight · highest activity
            </p>
          )}

          <header className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <Icon className="text-primary mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
              <h3
                className={cn(
                  "line-clamp-2 text-pretty leading-snug font-semibold",
                  featured ? "text-2xl" : "text-xl",
                )}
              >
                {title}
              </h3>
            </div>
            <Button
              variant="link"
              size="sm"
              tabIndex={-1}
              aria-hidden
              className="text-muted-foreground group-hover:text-foreground pointer-events-none shrink-0 text-sm font-medium"
            >
              {actionLabel}
            </Button>
          </header>

          <p
            className={cn(
              "mb-4 leading-none font-semibold tracking-tight tabular-nums",
              featured ? "text-4xl sm:text-5xl" : "text-4xl",
              urgency === "hot" && tone === "open" && "text-amber-400",
            )}
          >
            {heroValue}
            {heroSuffix && (
              <span className="text-muted-foreground ml-2 text-2xl font-medium">
                {heroSuffix}
              </span>
            )}
          </p>

          <div className={cn(featured && "lg:grid lg:grid-cols-2 lg:items-center lg:gap-6")}>
            <div className={cn(featured && "space-y-4")}>
              {rail && crowd ? (
                <RangeRail rail={rail} tone={tone} crowd={crowd} size={featured ? "large" : "default"} />
              ) : crowd ? (
                <p className="text-muted-foreground text-sm">
                  Crowd call <span className="text-primary">{crowd}</span>
                </p>
              ) : null}

              {!featured && <MarketCardStatsGrid stats={stats} />}
            </div>

            {featured && (
              <div className="mt-4 space-y-4 lg:mt-0">
                <MarketCardStatsGrid stats={stats} />
              </div>
            )}
          </div>

          <div className="mt-auto">
            <MarketCardDetails
              card={card}
              tone={tone}
              lockSec={lockSec}
              conviction={conviction}
              outcome={outcome}
              crowd={crowd}
              urgency={urgency}
            />
          </div>
        </div>
      </section>
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
