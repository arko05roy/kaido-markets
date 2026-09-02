"use client";

import { Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { MarketFilter } from "@/components/market/markets-board";

const FILTER_OPTIONS: { id: MarketFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "hot", label: "Hot" },
  { id: "closing", label: "Closing soon" },
  { id: "wide", label: "Wide open" },
  { id: "moves", label: "Biggest moves" },
  { id: "new", label: "New" },
];

export function MarketFilterSheet({
  open,
  onOpenChange,
  filter,
  onFilterChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: MarketFilter;
  onFilterChange: (f: MarketFilter) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="border-white/10 bg-[#0a0a0b]">
        <SheetHeader>
          <SheetTitle className="font-serif text-[#f3efe6]">Filter markets</SheetTitle>
        </SheetHeader>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                onFilterChange(f.id);
                onOpenChange(false);
              }}
              className={`rounded-xl border px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] ${
                filter === f.id
                  ? "border-[#d8c69a]/40 bg-[#d8c69a]/12 text-[#f3efe6]"
                  : "border-white/10 text-white/45"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => {
            onFilterChange("all");
            onOpenChange(false);
          }}
        >
          Reset
        </Button>
      </SheetContent>
    </Sheet>
  );
}

export function MobileFilterTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/55 lg:hidden"
    >
      <Filter className="size-3.5" />
      Filters
    </button>
  );
}
