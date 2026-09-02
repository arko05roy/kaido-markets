"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function FirstVisitGate() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = "kaido:first-visit-dismissed";
    if (!localStorage.getItem(key)) setOpen(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem("kaido:first-visit-dismissed", "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How Kaido works</DialogTitle>
          <DialogDescription>No math. Three steps.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm text-white/65">
          <li>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d8c69a]">
              1 · Call
            </span>
            <p className="mt-1">Pick where you think the number lands.</p>
          </li>
          <li>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d8c69a]">
              2 · Conviction
            </span>
            <p className="mt-1">Press how tight or wide your belief is.</p>
          </li>
          <li>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d8c69a]">
              3 · Place belief
            </span>
            <p className="mt-1">Size your risk and sign once. You&apos;re live.</p>
          </li>
        </ol>
        <DialogFooter>
          <Button onClick={dismiss} className="bg-[#f3efe6] text-[#141416] hover:bg-white">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateReviewModal({
  open,
  onOpenChange,
  question,
  marketType,
  schedule,
  resolverLabel,
  onDeploy,
  deploying,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: string;
  marketType: string;
  schedule: string;
  resolverLabel: string;
  onDeploy: () => void;
  deploying: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ready to deploy?</DialogTitle>
          <DialogDescription>Review before you sign.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Question</dt>
            <dd className="max-w-[60%] text-right text-[#f3efe6]">{question}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Type</dt>
            <dd className="text-[#f3efe6]">{marketType}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Schedule</dt>
            <dd className="text-right font-mono text-xs text-[#f3efe6]">{schedule}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Settlement</dt>
            <dd className="text-[#f3efe6]">{resolverLabel}</dd>
          </div>
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deploying}>
            Back
          </Button>
          <Button
            onClick={onDeploy}
            disabled={deploying}
            className="bg-[#f3efe6] text-[#141416] hover:bg-white"
          >
            {deploying ? "Deploying…" : "Deploy market"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateSuccessModal({
  open,
  onOpenChange,
  marketId,
  question,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketId: string;
  question: string;
}) {
  const copy = () => void navigator.clipboard.writeText(marketId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Market is live</DialogTitle>
          <DialogDescription>{question}</DialogDescription>
        </DialogHeader>
        <p className="font-mono text-xs text-white/50">
          {marketId.slice(0, 10)}…{marketId.slice(-8)}
        </p>
        <DialogFooter className="flex-wrap">
          <Button variant="outline" onClick={() => void copy()}>
            Copy address
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button asChild className="bg-[#f3efe6] text-[#141416] hover:bg-white">
            <Link href={`/markets/${marketId}`}>Trade now</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShareCurveModal({
  open,
  onOpenChange,
  marketTitle,
  call,
  conviction,
  maxWin,
  onDownloadPng,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketTitle: string;
  call: string;
  conviction: string;
  maxWin: string;
  onDownloadPng?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share your curve</DialogTitle>
          <DialogDescription>PNG export coming soon — copy details for now.</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-white/10 bg-[#080809] p-4 text-sm">
          <p className="font-serif text-[#f3efe6]">{marketTitle}</p>
          <p className="mt-2 font-mono text-xs text-white/50">
            Call {call} · {conviction} · Max win {maxWin}
          </p>
        </div>
        <DialogFooter className="flex-wrap">
          {onDownloadPng && (
            <Button variant="outline" onClick={onDownloadPng}>
              Download PNG
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            className="bg-[#f3efe6] text-[#141416] hover:bg-white"
            onClick={() => {
              const text = `${marketTitle} — my call ${call}, ${conviction}, max win ${maxWin}`;
              void navigator.clipboard.writeText(text);
            }}
          >
            Copy text
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
