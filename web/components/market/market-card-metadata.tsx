"use client";

import { MoreHorizontal } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { tierLabel } from "@/lib/market-display";
import type { registry } from "@kaido/contract-bindings";

export function MarketCardMetadata({
  address,
  info,
  onClick,
}: {
  address: string;
  info: registry.MarketInfo;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const copy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void navigator.clipboard.writeText(address);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick?.(e);
          }}
          className="rounded-md p-1 text-white/30 hover:bg-white/5 hover:text-white/60"
          aria-label="Market metadata"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64" onClick={(e) => e.stopPropagation()}>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">Contract</p>
        <p className="mt-1 break-all font-mono text-xs text-[#f3efe6]">{address}</p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">Type</p>
        <p className="mt-1 text-sm text-white/65">
          {info.outcome_space.tag === "Trajectory" ? "Path market" : "Range market"}
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">Oracle</p>
        <p className="mt-1 text-sm text-white/65">{tierLabel(info.tier)}</p>
        <button
          type="button"
          onClick={copy}
          className="mt-4 w-full rounded-lg border border-white/10 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d8c69a] hover:bg-white/5"
        >
          Copy address
        </button>
      </PopoverContent>
    </Popover>
  );
}
