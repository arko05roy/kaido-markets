"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BLEND_COLLATERAL_FACTOR_BPS,
  BLEND_BORROW_NUM,
  BLEND_BORROW_DEN,
  displayBlendTapBreakdown,
  formatUsdc7dp,
  usdc7dpFromFloat,
} from "@/lib/blend-tap";

const FLOW_STEPS = [
  { id: "you", label: "Your wallet", sub: "transfer" },
  { id: "market", label: "Market", sub: "locks margin" },
  { id: "bridge", label: "Liquidity bridge", sub: "collateralize" },
  { id: "pool", label: "Blend pool", sub: "USDC lent" },
] as const;

function FlowRail({ active }: { active: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#6eb8a8]/20 bg-[#0d1211] p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:repeating-linear-gradient(90deg,rgba(110,184,168,0.06)_0px,rgba(110,184,168,0.06)_1px,transparent_1px,transparent_12px)]"
      />
      <div className="relative flex items-stretch justify-between gap-1 sm:gap-2">
        {FLOW_STEPS.map((step, i) => (
          <div key={step.id} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-[#6eb8a8]/90 sm:text-[10px]">
                {step.label}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-white/35">{step.sub}</p>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div className="relative flex h-8 w-6 shrink-0 items-center justify-center sm:w-8">
                <span className="h-px w-full bg-[#6eb8a8]/25" />
                {active && (
                  <span
                    className="blend-flow-dot absolute size-1.5 rounded-full bg-[#6eb8a8] shadow-[0_0_10px_rgba(110,184,168,0.8)]"
                    style={{ animationDelay: `${i * 0.45}s` }}
                  />
                )}
                <ArrowRight className="absolute -right-0.5 size-3 text-[#6eb8a8]/40" aria-hidden />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AmountRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <div>
        <span className="text-sm text-white/45">{label}</span>
        {note ? <p className="mt-0.5 text-[10px] text-white/30">{note}</p> : null}
      </div>
      <span className="font-mono text-sm tabular-nums text-[#f3efe6]">{value}</span>
    </div>
  );
}

export function BlendBorrowModal({
  open,
  onOpenChange,
  symbol,
  feeBps,
  riskUsdc,
  poolDepth7dp,
  onContinue,
  continuing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string;
  feeBps: number;
  riskUsdc: number;
  poolDepth7dp?: bigint;
  onContinue: () => void;
  continuing?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!open) {
      setRevealed(false);
      return;
    }
    const t = window.requestAnimationFrame(() => setRevealed(true));
    return () => window.cancelAnimationFrame(t);
  }, [open]);

  const breakdown = useMemo(() => {
    if (!Number.isFinite(riskUsdc) || riskUsdc <= 0) return null;
    return displayBlendTapBreakdown({
      maxTotal7dp: usdc7dpFromFloat(riskUsdc),
      feeBps,
      poolDepth7dp,
    });
  }, [riskUsdc, feeBps, poolDepth7dp]);

  const borrowRatio = `${BLEND_BORROW_NUM}/${BLEND_BORROW_DEN}`;
  const ltvPct = Number(BLEND_COLLATERAL_FACTOR_BPS) / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(92vh,640px)] overflow-y-auto border-[#6eb8a8]/15 bg-[#080809] sm:max-w-lg"
        showCloseButton={!continuing}
        onPointerDownOutside={(e) => continuing && e.preventDefault()}
      >
        <DialogHeader className="space-y-2 text-left">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#6eb8a8]">
            Liquidity
          </p>
          <DialogTitle className="font-serif text-2xl leading-tight tracking-tight text-[#f3efe6]">
            Counterparty depth
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-white/50">
            Your margin is posted to Blend and matched with pool USDC so the market can take the
            other side. Repaid automatically when positions settle.
          </DialogDescription>
        </DialogHeader>

        <FlowRail active={revealed && breakdown != null} />

        {breakdown && (
          <div className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d8c69a]/80">
              Trade settlement
            </p>
            <AmountRow
              label="You pay"
              value={`${formatUsdc7dp(breakdown.maxTotal7dp)} ${symbol}`}
              note="margin + fee"
            />
            <AmountRow
              label="Posted as collateral"
              value={`${formatUsdc7dp(breakdown.collateral7dp)} ${symbol}`}
            />
            <AmountRow
              label="Protocol fee"
              value={`${formatUsdc7dp(breakdown.fee7dp)} ${symbol}`}
              note={feeBps > 0 ? `${(feeBps / 100).toFixed(2)}%` : undefined}
            />
            <AmountRow
              label="Borrowed from Blend"
              value={`${formatUsdc7dp(breakdown.borrow7dp)} ${symbol}`}
              note={`${borrowRatio} of collateral · ${ltvPct}% LTV`}
            />
            <AmountRow
              label="Pool headroom after"
              value={`${formatUsdc7dp(breakdown.depthAfter7dp)} ${symbol}`}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={continuing}
            className="border-white/12 text-white/70"
          >
            Back
          </Button>
          <Button
            onClick={onContinue}
            disabled={continuing || !breakdown}
            className="bg-[#6eb8a8] text-[#0a1211] hover:bg-[#7ec9b8]"
          >
            {continuing ? <Loader2 className="size-4 animate-spin" /> : null}
            Sign trade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
