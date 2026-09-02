"use client";

import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Copy,
  Lock,
} from "lucide-react";
import * as React from "react";

import { ClosesIn } from "@/components/market/closes-in";
import { useLedgerNow } from "@/components/providers/ledger-time-provider";
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

function toneStyles(tone: CardTone, urgency: "hot" | "warm" | null) {
  if (tone === "open" && urgency === "hot") {
    return {
      paper: "bg-[#1b1c1d]",
      wash: "bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.035),transparent_34%)]",
      line: "bg-[#f6b85d]",
      ink: "text-[#f6b85d]",
      icon: "text-[#f6b85d]",
      badge: "border-[#f6b85d]/30 bg-[#26211b] text-[#ffdca4]",
      accentText: "text-[#ffdca4]",
    };
  }

  switch (tone) {
    case "open":
      return {
        paper: "bg-[#1b1c1d]",
        wash: "bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.03),transparent_36%)]",
        line: "bg-[#d8c69a]",
        ink: "text-[#d8c69a]",
        icon: "text-[#d8c69a]",
        badge: "border-[#d8c69a]/24 bg-[#23221d] text-[#ead9ad]",
        accentText: "text-[#ead9ad]",
      };
    case "locked":
      return {
        paper: "bg-[#1a1c1d]",
        wash: "bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.028),transparent_36%)]",
        line: "bg-[#8fdfc6]",
        ink: "text-[#8fdfc6]",
        icon: "text-[#8fdfc6]",
        badge: "border-[#8fdfc6]/24 bg-[#1d2323] text-[#bff4e5]",
        accentText: "text-[#bff4e5]",
      };
    case "disputable":
      return {
        paper: "bg-[#1c1a1a]",
        wash: "bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.028),transparent_36%)]",
        line: "bg-[#e78c6f]",
        ink: "text-[#e78c6f]",
        icon: "text-[#e78c6f]",
        badge: "border-[#e78c6f]/24 bg-[#271f1d] text-[#ffc2b0]",
        accentText: "text-[#ffc2b0]",
      };
    default:
      return {
        paper: "bg-[#1b1b1e]",
        wash: "bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.03),transparent_36%)]",
        line: "bg-white/28",
        ink: "text-white/40",
        icon: "text-white/42",
        badge: "border-white/[0.08] bg-[#222226] text-white/55",
        accentText: "text-white/62",
      };
  }
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
  const lineColor = live ? "#d8c69a" : settled ? "rgba(255,255,255,0.25)" : "rgba(216,198,154,0.35)";

  return (
    <div className={cn("space-y-2", large && "space-y-3")}>
      <div className={cn("relative", large ? "h-12" : "h-10")} aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.12]" />
        <div
          className={cn(
            "absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full",
            live && "shadow-[0_0_24px_rgba(216,198,154,0.18)]",
          )}
          style={{
            left: `${rail.zoneLeft}%`,
            width: `${Math.max(rail.zoneRight - rail.zoneLeft, 1)}%`,
            background: lineColor,
          }}
        />
        <div
          className={cn("absolute top-1/2 h-8 w-px -translate-x-1/2 -translate-y-1/2 bg-[#f3efe6]")}
          style={{ left: `${rail.muPct}%` }}
        />
        {rail.outcomePct != null ? (
          <div
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f3efe6]/60 bg-[#121214]"
            style={{ left: `${rail.outcomePct}%` }}
          />
        ) : null}
      </div>
      <div
        className={cn(
          "flex items-end justify-between gap-2 font-mono tabular-nums tracking-tight text-white/42",
          large ? "text-[11px]" : "text-[10px]",
        )}
      >
        <span>{rail.minLabel}</span>
        <span className={cn("text-center", large ? "text-xs" : "text-[11px]", live && "text-[#d8c69a]")}>
          {settled && rail.outcomePct != null ? "Settled" : "Crowd"} · {crowd}
        </span>
        <span>{rail.maxLabel}</span>
      </div>
    </div>
  );
}

function ToneIcon({
  tone,
  className,
}: {
  tone: CardTone;
  className?: string;
}) {
  switch (tone) {
    case "open":
      return <Activity className={className} aria-hidden="true" />;
    case "locked":
      return <Lock className={className} aria-hidden="true" />;
    case "disputable":
      return <AlertCircle className={className} aria-hidden="true" />;
    default:
      return <CheckCircle2 className={className} aria-hidden="true" />;
  }
}

function fmtVol(usdc: number): string {
  if (usdc >= 1_000_000) return `$${(usdc / 1_000_000).toFixed(1)}M`;
  if (usdc >= 1_000) return `$${(usdc / 1_000).toFixed(1)}k`;
  return `$${usdc.toFixed(0)}`;
}

function MarketCardStatsGrid({ stats, featured = false }: { stats?: MarketStats24h; featured?: boolean }) {
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

  const cells = [left, right].filter(
    (cell): cell is { label: string; value: string } => cell != null,
  );

  return (
    <div
      className={cn(
        "grid gap-2.5",
        cells.length > 1 ? "grid-cols-2" : "grid-cols-1",
        featured && "lg:grid-cols-2",
      )}
      aria-label="Market stats"
    >
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0">
          <p className="font-mono text-[9px] tracking-[0.16em] text-white/34 uppercase">
            {cell.label}
          </p>
          <p className="mt-1 truncate text-base leading-tight font-semibold tabular-nums text-[#f3efe6] sm:text-[1.05rem]">
            {cell.value}
          </p>
        </div>
      ))}
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
    <div className="mt-3.5">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-black/12 px-3.5 py-2.5 text-left transition-[background-color,border-color,transform] hover:border-white/[0.16] hover:bg-black/18 active:scale-[0.98]"
        onClick={(e) => {
          e.preventDefault();
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="font-mono text-[11px] tracking-[0.16em] text-white/46 uppercase">
          Market details
        </span>
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
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.14] py-2 text-sm font-medium text-white/72 transition-[color,border-color,transform] duration-150 hover:border-white/[0.24] hover:text-[#f3efe6] active:scale-[0.98]"
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
  const actionLabel = tradable ? "Trade range" : "View market";
  const toneClass = toneStyles(tone, urgency);

  return (
    <Link
      href={`/markets/${address}`}
      className={cn(
        "group block h-full outline-none transition-transform duration-200 active:scale-[0.99]",
        className,
      )}
      style={style}
    >
      <section
        aria-label={`${title} market card`}
        className={cn(
          "relative flex h-full flex-col overflow-hidden rounded-[1.1rem] border border-white/[0.09] p-0 shadow-[0_24px_72px_-48px_rgba(0,0,0,0.95)] transition-[box-shadow,border-color,transform] duration-200",
          toneClass.paper,
          "group-hover:-translate-y-0.5 group-hover:border-white/[0.16] group-hover:shadow-[0_32px_84px_-52px_rgba(0,0,0,1)]",
          "group-focus-visible:ring-2 group-focus-visible:ring-[#d8c69a]/70 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[#141416]",
          featured && "border-white/[0.14]",
        )}
      >
        <div aria-hidden className="kaido-grain pointer-events-none absolute inset-0 rounded-[1.1rem]" />
        <div aria-hidden className={cn("pointer-events-none absolute inset-0", toneClass.wash)} />
        <div aria-hidden className={cn("absolute inset-x-0 top-0 h-px", toneClass.line)} />

        <div className="relative flex h-full flex-col p-3.5 sm:p-4.5">
          <header className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="min-w-0">
                <h3
                  className={cn(
                    "line-clamp-3 font-serif text-pretty leading-[1.03] tracking-[-0.03em] text-[#f3efe6]",
                    featured ? "text-[1.8rem] sm:text-[2.2rem]" : "text-[1.4rem] sm:text-[1.6rem]",
                  )}
                >
                  {title}
                </h3>
              </div>
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium",
                toneClass.badge,
              )}
            >
              {statusText}
            </span>
          </header>

          <div className="mt-4 grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_165px]">
            <div className="min-w-0">
              <div
                className={cn(
                  "rounded-[0.95rem] border border-white/[0.08] bg-black/14",
                  featured ? "p-3.5 sm:p-4.5" : "p-3.5",
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="font-mono text-[9px] tracking-[0.18em] text-white/34 uppercase">
                    Crowd belief
                  </p>
                  {conviction && tone !== "settled" && (
                    <span className={cn("text-[11px] font-medium", toneClass.accentText)}>
                      {conviction}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "mt-2.5 max-w-full truncate leading-none font-semibold tabular-nums text-[#f3efe6] text-[1.8rem] sm:text-[2.2rem]",
                    urgency === "hot" && tone === "open" && "text-amber-300",
                  )}
                >
                  {crowd}
                </p>
              </div>

              <div className="mt-4">
                {rail && crowd ? (
                  <RangeRail
                    rail={rail}
                    tone={tone}
                    crowd={crowd}
                    size={featured ? "large" : "default"}
                  />
                ) : crowd ? (
                  <p className="text-sm text-white/52">
                    Crowd call <span className={toneClass.accentText}>{crowd}</span>
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div>
                  <p className="font-mono text-[9px] tracking-[0.18em] text-white/34 uppercase">
                    Market type
                  </p>
                  <p className="mt-1 text-[13px] text-[#f3efe6] sm:text-sm">
                    {info.outcome_space.tag === "Trajectory" ? "Path market" : "Range market"}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] tracking-[0.18em] text-white/34 uppercase">
                    Window
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[1.35rem] font-semibold tabular-nums text-[#f3efe6] sm:text-[1.5rem]",
                      urgency === "hot" && "text-amber-300",
                    )}
                  >
                    {tone === "open" ? <ClosesIn at={lockSec} /> : statusText}
                  </p>
                </div>
                <MarketCardStatsGrid stats={stats} featured={featured} />
              </div>

              <div className="border-t border-white/[0.08] pt-3.5">
                <p className="text-[11px] text-white/36">
                  {tradable ? "Open for conviction" : "Read only"}
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="font-mono text-[9px] tracking-[0.18em] text-white/32 uppercase">
                    Action
                  </p>
                  <span className={cn("inline-flex items-center gap-1 text-[13px] font-medium sm:text-sm", toneClass.accentText)}>
                    {actionLabel}
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
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
