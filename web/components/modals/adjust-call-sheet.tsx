"use client";

import { type KaidoConfig } from "@kaido/sdk";

import { TradePanel, type TradeMarketView } from "@/components/forecast/trade-panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function AdjustCallSheet({
  open,
  onOpenChange,
  config,
  market,
  marketTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: KaidoConfig;
  market: TradeMarketView;
  marketTitle?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto border-white/10 bg-[#0a0a0b]">
        <SheetHeader>
          <SheetTitle className="font-serif text-[#f3efe6]">Place a new belief</SheetTitle>
          <SheetDescription>
            On-chain positions are immutable — this opens a new position, it doesn&apos;t edit the
            old one.
          </SheetDescription>
        </SheetHeader>
        <div className="pb-8">
          <TradePanel
            config={config}
            market={{ ...market, marketTitle }}
            compact
            onPositionOpened={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
