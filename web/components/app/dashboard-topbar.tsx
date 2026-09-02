"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ConnectButton } from "@/components/wallet/connect-button";
import { cn } from "@/lib/utils";

type TopbarContext = { group: string; title: string };

function resolveTopbarContext(pathname: string | null): TopbarContext {
  if (!pathname) return { group: "Kaido", title: "Dashboard" };
  if (pathname.startsWith("/markets/") && pathname !== "/markets") {
    return { group: "Trade", title: "Market" };
  }
  if (pathname === "/markets") return { group: "Trade", title: "Markets" };
  if (pathname === "/positions") return { group: "Trade", title: "Positions" };
  if (pathname === "/create") return { group: "Launch", title: "Create market" };
  if (pathname === "/leaderboard") return { group: "Learn", title: "Leaderboard" };
  if (pathname === "/whitepaper") return { group: "Learn", title: "How it works" };
  return { group: "Kaido", title: "Dashboard" };
}

function TopbarContextLabel({ group, title }: TopbarContext) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="hidden h-px w-6 shrink-0 bg-[#d8c69a]/45 sm:block" aria-hidden />
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#d8c69a]/75">
          {group}
        </p>
        <p className="truncate font-serif text-base leading-tight tracking-[-0.02em] text-[#f3efe6] sm:text-lg">
          {title}
        </p>
      </div>
    </div>
  );
}

export function DashboardTopbar({ className }: { className?: string }) {
  const pathname = usePathname();
  const context = resolveTopbarContext(pathname);
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-[4.25rem] shrink-0 items-center gap-3 border-b border-white/[0.06]",
        "bg-[#141416]/90 px-4 backdrop-blur-md sm:gap-4 sm:px-6",
        "after:pointer-events-none after:absolute after:inset-x-6 after:bottom-0 after:h-px",
        "after:bg-gradient-to-r after:from-transparent after:via-[#d8c69a]/30 after:to-transparent",
        className,
      )}
    >
      <SidebarTrigger
        className={cn(
          "size-9 shrink-0 rounded-xl border border-white/[0.06] bg-[#1c1c21] text-white/50",
          "hover:border-white/[0.1] hover:bg-[#1f1f25] hover:text-[#f3efe6]",
        )}
      />

      <div className="min-w-0 flex-1">
        <TopbarContextLabel {...context} />
      </div>

      <p
        suppressHydrationWarning
        className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-white/30 lg:block"
      >
        {today}
      </p>

      <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
        <ConnectButton />
        <Button
          asChild
          className={cn(
            "h-9 rounded-xl border border-[#d8c69a]/25 bg-[#d8c69a] px-3.5 font-mono text-[10px] uppercase tracking-[0.16em]",
            "text-[#141416] shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset] hover:bg-[#e5d4a8]",
            "sm:px-4",
          )}
        >
          <Link href="/create">
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">Create market</span>
            <span className="sm:hidden">Create</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
