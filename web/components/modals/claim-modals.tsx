"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatUsdc7dp } from "@/lib/positions";
import { clientSettlementAsset } from "@/lib/settlement-asset";

export function ClaimReceiptModal({
  open,
  onOpenChange,
  positionId,
  collateral7dp,
  estimatedPayout7dp,
  onConfirm,
  confirming,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  positionId: string;
  collateral7dp?: bigint;
  estimatedPayout7dp?: bigint;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const sym = clientSettlementAsset().symbol;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm claim</DialogTitle>
          <DialogDescription>Review before signing your claim transaction.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Position</dt>
            <dd className="font-mono text-[#f3efe6]">#{positionId}</dd>
          </div>
          {collateral7dp != null && (
            <div className="flex justify-between gap-4">
              <dt className="text-white/45">Collateral</dt>
              <dd className="font-mono text-[#f3efe6]">{formatUsdc7dp(collateral7dp)} {sym}</dd>
            </div>
          )}
          {estimatedPayout7dp != null && (
            <div className="flex justify-between gap-4">
              <dt className="text-white/45">Est. payout</dt>
              <dd className="font-mono text-emerald-300/90">
                {formatUsdc7dp(estimatedPayout7dp)} {sym}
              </dd>
            </div>
          )}
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={confirming}
            className="bg-[#f3efe6] text-[#141416] hover:bg-white"
          >
            {confirming ? "Signing…" : "Confirm claim"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClaimSuccessModal({
  open,
  onOpenChange,
  payout7dp,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payout7dp: bigint;
  children?: React.ReactNode;
}) {
  const sym = clientSettlementAsset().symbol;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Claim complete</DialogTitle>
          <DialogDescription>
            You received{" "}
            <span className="font-mono text-emerald-300/90">{formatUsdc7dp(payout7dp)} {sym}</span>.
          </DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="bg-[#f3efe6] text-[#141416] hover:bg-white">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LpConfirmModal({
  open,
  onOpenChange,
  mode,
  amountLabel,
  warning,
  onConfirm,
  confirming,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "remove";
  amountLabel: string;
  warning?: string;
  onConfirm: () => void;
  confirming: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add liquidity" : "Remove liquidity"}</DialogTitle>
          <DialogDescription>{amountLabel}</DialogDescription>
        </DialogHeader>
        {warning && <p className="text-xs text-amber-300/80">{warning}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={confirming}
            className="bg-[#f3efe6] text-[#141416] hover:bg-white"
          >
            {confirming ? "Signing…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DisputeInfoModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispute window</DialogTitle>
          <DialogDescription>
            Someone challenged the proposed outcome. The market stays disputable until the window
            closes or an arbiter picks the final number. Your positions stay frozen until
            resolution.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="bg-[#f3efe6] text-[#141416] hover:bg-white">
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
