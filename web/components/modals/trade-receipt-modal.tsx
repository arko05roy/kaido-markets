"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TradeQuote } from "@/lib/trade-quote";

function QuoteRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-white/45">{label}</span>
      <span className={`font-mono tabular-nums ${accent ? "text-emerald-300/90" : "text-[#f3efe6]"}`}>
        {value}
      </span>
    </div>
  );
}

export function TradeReceiptModal({
  open,
  onOpenChange,
  call,
  conviction,
  riskUsdc,
  quote,
  quoting,
  symbol,
  onConfirm,
  onBack,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  call: string;
  conviction: string;
  riskUsdc: number;
  quote: TradeQuote | null;
  quoting: boolean;
  symbol: string;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!quoting}>
        <DialogHeader>
          <DialogTitle>Confirm your belief</DialogTitle>
          <DialogDescription>
            Review your call before signing. Final on-chain quote may differ slightly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl border border-white/[0.06] bg-[#080809] p-4">
          <QuoteRow label="Your call" value={call} />
          <QuoteRow label="Conviction" value={conviction} />
          <QuoteRow label="Risk" value={`${riskUsdc} ${symbol}`} />
          {quoting && (
            <p className="flex items-center gap-2 text-xs text-white/45">
              <Loader2 className="size-3.5 animate-spin" />
              Simulating quote…
            </p>
          )}
          {quote && !quoting && (
            <>
              <QuoteRow label="Collateral" value={`${quote.collateralUsdc.toFixed(2)} ${symbol}`} />
              <QuoteRow label="Est. max payout" value={`+${quote.maxWin.toFixed(2)} ${symbol}`} accent />
              <QuoteRow label="Max multiple" value={`${quote.multiple.toFixed(1)}x`} />
              <QuoteRow label="Worst case" value={`−${quote.worstCase.toFixed(2)} ${symbol}`} />
              {quote.feeUsdc > 0 && (
                <QuoteRow label="Est. fee" value={`${quote.feeUsdc.toFixed(4)} ${symbol}`} />
              )}
            </>
          )}
          <p className="border-t border-white/[0.06] pt-2 text-[10px] leading-relaxed text-white/35">
            Estimated at current crowd. Final quote shown before signing.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onBack} disabled={quoting}>
            Back to edit
          </Button>
          <Button
            onClick={onConfirm}
            disabled={quoting || !quote}
            className="bg-[#f3efe6] text-[#141416] hover:bg-white"
          >
            {quoting ? <Loader2 className="size-4 animate-spin" /> : null}
            Confirm & sign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TradeSubmittingModal({ open }: { open: boolean }) {
  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} onPointerDownOutside={(e) => e.preventDefault()}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Loader2 className="size-8 animate-spin text-[#d8c69a]" />
          <div>
            <p className="font-serif text-lg text-[#f3efe6]">Waiting for signature…</p>
            <p className="mt-1 text-sm text-white/45">Approve the trade in Freighter.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
