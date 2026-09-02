"use client";

/**
 * Screenshot-ready result card: your belief curve, the realised outcome, P&L.
 */
import { useCallback, useMemo, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

import { BeliefChart } from "@/components/forecast/belief-chart";
import { Button } from "@/components/ui/button";
import { fromWad, type GaussianBelief } from "@/lib/curve";
import { formatUsdc7dp } from "@/lib/positions";

export interface ResultCardProps {
  marketLabel: string;
  kind: "scalar" | "trajectory";
  market: { kWad: bigint; bWad: bigint };
  /** The belief you traded (scalar). */
  yourBelief?: GaussianBelief;
  /** Resolved outcome(s) in WAD. */
  resolvedWad: bigint[];
  /** Collateral posted (7dp USDC stroops), if known. */
  collateral7dp?: bigint;
  /** Payout received (7dp USDC stroops). */
  payout7dp: bigint;
  positionId: string;
}

function buildShareText(props: ResultCardProps, pnl7dp: bigint): string {
  const pnl = formatUsdc7dp(pnl7dp < 0n ? -pnl7dp : pnl7dp);
  const sign = pnl7dp >= 0n ? "+" : "−";
  const outcome =
    props.kind === "scalar" && props.resolvedWad[0] != null
      ? fromWad(props.resolvedWad[0]).toPrecision(6)
      : props.resolvedWad.map((x) => fromWad(x).toPrecision(4)).join(" · ");
  return `${props.marketLabel} · position #${props.positionId}\nOutcome: ${outcome}\nP&L: ${sign}${pnl} USDC`;
}

export function ResultCard(props: ResultCardProps) {
  const { marketLabel, kind, market, yourBelief, resolvedWad, collateral7dp, payout7dp, positionId } =
    props;

  const pnl7dp = useMemo(() => {
    const col = collateral7dp ?? 0n;
    return payout7dp - col;
  }, [collateral7dp, payout7dp]);

  const [copied, setCopied] = useState(false);
  const shareText = useMemo(() => buildShareText(props, pnl7dp), [props, pnl7dp]);

  const copyShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [shareText]);

  const nativeShare = useCallback(async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: marketLabel, text: shareText });
        return;
      } catch {
        /* fall through */
      }
    }
    void copyShare();
  }, [copyShare, marketLabel, shareText]);

  const resolvedScalar =
    kind === "scalar" && resolvedWad[0] != null ? fromWad(resolvedWad[0]) : undefined;

  const chart =
    kind === "scalar" && yourBelief ? (
      <BeliefChart
        mode="scalar"
        market={market}
        range={{
          min: fromWad(yourBelief.muWad) - 5 * fromWad(yourBelief.sigmaWad),
          max: fromWad(yourBelief.muWad) + 5 * fromWad(yourBelief.sigmaWad),
        }}
        consensus={yourBelief}
        you={yourBelief}
        resolved={resolvedScalar}
        height={200}
      />
    ) : null;

  const pnlLabel = pnl7dp >= 0n ? `+${formatUsdc7dp(pnl7dp)}` : `−${formatUsdc7dp(-pnl7dp)}`;

  return (
    <div
      className="overflow-hidden border border-[#d8c69a]/25 bg-[#0a0a0b] p-5"
      data-testid="result-card"
    >
      <div className="mb-3 space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d8c69a]">Result</p>
        <h3 className="font-serif text-xl text-[#f3efe6]">{marketLabel}</h3>
        <p className="font-mono text-xs text-white/40">Position #{positionId}</p>
      </div>

      {chart}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {resolvedScalar != null && (
          <>
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Outcome</dt>
            <dd className="text-right font-mono text-[#f3efe6]">{resolvedScalar.toPrecision(6)}</dd>
          </>
        )}
        {collateral7dp != null && (
          <>
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Collateral</dt>
            <dd className="text-right font-mono text-[#f3efe6]">{formatUsdc7dp(collateral7dp)} USDC</dd>
          </>
        )}
        <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Payout</dt>
        <dd className="text-right font-mono text-[#f3efe6]">{formatUsdc7dp(payout7dp)} USDC</dd>
        <dt className="font-medium text-[#f3efe6]">P&L</dt>
        <dd
          className={`text-right font-mono font-semibold ${pnl7dp >= 0n ? "text-emerald-400" : "text-red-400"}`}
        >
          {pnlLabel} USDC
        </dd>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => void copyShare()}
          className="rounded-full bg-[#f3efe6] text-[#0b0b0c] hover:bg-white"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void nativeShare()}
          className="border-white/20 text-[#f3efe6] hover:bg-white/5"
        >
          <Share2 className="size-4" />
          Share
        </Button>
      </div>
    </div>
  );
}
