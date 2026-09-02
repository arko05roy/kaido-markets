"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MiniCrowdCurve } from "@/components/market/mini-crowd-curve";

export interface PositionDetailData {
  marketId: string;
  marketTitle: string;
  status: string;
  call: string;
  conviction: string;
  riskUsdc: string;
  edgeLabel: string;
  maxWin: string;
  closesIn?: string;
  crowdMuWad?: string;
  crowdSigmaWad?: string;
  kWad?: string;
  bWad?: string;
}

function DetailBody({ data }: { data: PositionDetailData }) {
  return (
    <div className="space-y-4">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-white/45">Call</dt>
          <dd className="font-mono text-[#f3efe6]">{data.call}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-white/45">Conviction</dt>
          <dd className="text-[#f3efe6]">{data.conviction}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-white/45">Risk</dt>
          <dd className="font-mono text-[#f3efe6]">{data.riskUsdc}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-white/45">Est. max win</dt>
          <dd className="font-mono text-emerald-300/90">{data.maxWin}</dd>
        </div>
      </dl>
      <p className="text-xs text-white/50">{data.edgeLabel}</p>
      {data.crowdMuWad && data.crowdSigmaWad && data.kWad && data.bWad && (
        <MiniCrowdCurve
          muWad={BigInt(data.crowdMuWad)}
          sigmaWad={BigInt(data.crowdSigmaWad)}
          kWad={BigInt(data.kWad)}
          bWad={BigInt(data.bWad)}
        />
      )}
    </div>
  );
}

function DetailActions({
  data,
  onShare,
  onClose,
  canAdjustCall,
  onAdjustCall,
}: {
  data: PositionDetailData;
  onShare?: () => void;
  onClose: () => void;
  canAdjustCall?: boolean;
  onAdjustCall?: () => void;
}) {
  return (
    <>
      {canAdjustCall && onAdjustCall ? (
        <Button variant="outline" onClick={onAdjustCall}>
          Adjust call
        </Button>
      ) : (
        <Button variant="outline" asChild>
          <Link href={`/markets/${data.marketId}`}>Adjust call</Link>
        </Button>
      )}
      {onShare && (
        <Button variant="outline" onClick={onShare}>
          Share curve
        </Button>
      )}
      <Button onClick={onClose} className="bg-[#f3efe6] text-[#141416] hover:bg-white">
        Close
      </Button>
    </>
  );
}

export function PositionDetailSheet({
  open,
  onOpenChange,
  data,
  onShare,
  canAdjustCall,
  onAdjustCall,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PositionDetailData | null;
  onShare?: () => void;
  canAdjustCall?: boolean;
  onAdjustCall?: () => void;
}) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (!data) return null;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85dvh] border-white/10 bg-[#0a0a0b]">
          <SheetHeader>
            <SheetTitle className="font-serif text-[#f3efe6]">{data.marketTitle}</SheetTitle>
            <SheetDescription>
              {data.status}
              {data.closesIn ? ` · ${data.closesIn} left` : ""}
            </SheetDescription>
          </SheetHeader>
          <DetailBody data={data} />
          <SheetFooter className="flex-row flex-wrap gap-2">
            <DetailActions
              data={data}
              onShare={onShare}
              onClose={() => onOpenChange(false)}
              canAdjustCall={canAdjustCall}
              onAdjustCall={onAdjustCall}
            />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{data.marketTitle}</DialogTitle>
          <DialogDescription>
            {data.status}
            {data.closesIn ? ` · ${data.closesIn} left` : ""}
          </DialogDescription>
        </DialogHeader>
        <DetailBody data={data} />
        <DialogFooter className="flex-wrap">
          <DetailActions
            data={data}
            onShare={onShare}
            onClose={() => onOpenChange(false)}
            canAdjustCall={canAdjustCall}
            onAdjustCall={onAdjustCall}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
