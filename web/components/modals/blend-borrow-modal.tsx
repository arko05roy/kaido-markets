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
  BLEND_REPAY_INTEREST_BUFFER_7DP,
  computeBlendTapBreakdown,
  formatUsdc7dp,
  usdc7dpFromFloat,
  type BlendTapBreakdown,
} from "@/lib/blend-tap";
import { cn } from "@/lib/utils";

const FLOW_STEPS = [
  { id: "you", label: "Your wallet", sub: "USDC out" },
  { id: "market", label: "Market", sub: "locks margin" },
  { id: "adapter", label: "BlendAdapter", sub: "deposit + borrow" },
  { id: "pool", label: "Blend pool", sub: "USDC in" },
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

function MathLine({
  expr,
  result,
  highlight,
}: {
  expr: string;
  result: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-white/[0.05] py-2.5 last:border-0",
        highlight && "-mx-2 rounded-md bg-[#6eb8a8]/[0.06] px-2",
      )}
    >
      <code className="font-mono text-[11px] leading-relaxed text-white/50 sm:text-xs">{expr}</code>
      <span
        className={cn(
          "shrink-0 font-mono text-xs tabular-nums sm:text-sm",
          highlight ? "text-[#6eb8a8]" : "text-[#f3efe6]",
        )}
      >
        {result}
      </span>
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
  availableDepth7dp,
  currentBacked7dp,
  loadingDepth,
  onContinue,
  continuing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string;
  feeBps: number;
  riskUsdc: number;
  availableDepth7dp: bigint;
  currentBacked7dp?: bigint;
  loadingDepth?: boolean;
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

  const breakdown: BlendTapBreakdown | null = useMemo(() => {
    if (!Number.isFinite(riskUsdc) || riskUsdc <= 0) return null;
    return computeBlendTapBreakdown({
      maxTotal7dp: usdc7dpFromFloat(riskUsdc),
      feeBps,
      availableDepth7dp,
      currentBacked7dp,
    });
  }, [riskUsdc, feeBps, availableDepth7dp, currentBacked7dp]);

  const sym = symbol;
  const borrowRatio = `${BLEND_BORROW_NUM}/${BLEND_BORROW_DEN}`;
  const ltvPct = Number(BLEND_COLLATERAL_FACTOR_BPS) / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(92vh,720px)] overflow-y-auto border-[#6eb8a8]/15 bg-[#080809] sm:max-w-xl"
        showCloseButton={!continuing}
        onPointerDownOutside={(e) => continuing && e.preventDefault()}
      >
        <DialogHeader className="space-y-3 text-left">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#6eb8a8]">
            BlendTap · JIT liquidity
          </p>
          <DialogTitle className="font-serif text-2xl leading-tight tracking-tight text-[#f3efe6]">
            Borrowing counterparty depth
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-white/50">
            This trade atomically posts your margin to Blend and draws USDC for the market&apos;s
            other side. Repaid from forfeitures when positions settle.
          </DialogDescription>
        </DialogHeader>

        <FlowRail active={revealed && !loadingDepth} />

        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d8c69a]/80">
              Settlement ledger
            </p>
            {loadingDepth || !breakdown ? (
              <p className="flex items-center gap-2 text-xs text-white/40">
                <Loader2 className="size-3.5 animate-spin" />
                Reading pool depth…
              </p>
            ) : (
              <>
                <AmountRow
                  label="You transfer"
                  value={`${formatUsdc7dp(breakdown.maxTotal7dp)} ${sym}`}
                  note="collateral + fee"
                />
                <AmountRow
                  label="Posted as Blend collateral"
                  value={`${formatUsdc7dp(breakdown.collateral7dp)} ${sym}`}
                />
                <AmountRow
                  label="Trade fee"
                  value={`${formatUsdc7dp(breakdown.fee7dp)} ${sym}`}
                  note={feeBps > 0 ? `${(feeBps / 100).toFixed(2)}% of collateral` : undefined}
                />
                <AmountRow
                  label="Borrowed from pool"
                  value={`${formatUsdc7dp(breakdown.borrow7dp)} ${sym}`}
                  note={`${borrowRatio} × collateral · LTV cap ${ltvPct}%`}
                />
                <AmountRow
                  label="Pool headroom after"
                  value={`${formatUsdc7dp(breakdown.depthAfter7dp)} ${sym}`}
                  note={`was ${formatUsdc7dp(breakdown.depthBefore7dp)} ${sym}`}
                />
              </>
            )}
          </div>

          {breakdown && !loadingDepth && (
            <div className="rounded-xl border border-white/[0.06] bg-[#141416]/80 p-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
                On-chain math
              </p>
              <MathLine
                expr={`collateral = total × 10⁴ / (10⁴ + ${feeBps})`}
                result={`${formatUsdc7dp(breakdown.collateral7dp)} ${sym}`}
              />
              <MathLine
                expr={`borrow₇ = ⌊collateral × ${borrowRatio}⌋`}
                result={`${formatUsdc7dp(breakdown.borrow7dp)} ${sym}`}
                highlight
              />
              <MathLine
                expr="depth′ = min(cap − outstanding, pool_avail) − borrow"
                result={`${formatUsdc7dp(breakdown.depthAfter7dp)} ${sym}`}
              />
              <MathLine
                expr={`unwind buffer = ${formatUsdc7dp(BLEND_REPAY_INTEREST_BUFFER_7DP)} ${sym}`}
                result="at claim"
              />
            </div>
          )}

          {breakdown && !breakdown.withinDepth && !loadingDepth && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200/90">
              Borrow exceeds available Blend depth ({formatUsdc7dp(breakdown.depthBefore7dp)}{" "}
              {sym}). Reduce trade size or wait for open positions to unwind at claim.
            </p>
          )}
        </div>

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
            disabled={continuing || loadingDepth || !breakdown || !breakdown.withinDepth}
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
