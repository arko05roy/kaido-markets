"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { AppSidebar } from "@/components/app/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ConnectButton } from "@/components/wallet/connect-button";
import { cn } from "@/lib/utils";

export function DashboardShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <SidebarProvider defaultOpen className="kaido-app kaido-dashboard bg-[#141416]">
      <AppSidebar />
      <SidebarInset className="min-h-svh bg-[#141416] text-[#f3efe6] md:peer-data-[variant=inset]:shadow-none">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#141416]/80 px-4 backdrop-blur-md sm:px-6">
            <SidebarTrigger className="text-white/60 hover:bg-white/[0.06] hover:text-[#f3efe6]" />
            <div className="hidden min-w-0 flex-1 sm:block">
              <p
                suppressHydrationWarning
                className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-white/35"
              >
                {today}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <ConnectButton />
              <Button
                asChild
                className="h-9 rounded-xl bg-[#d8c69a] px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[#141416] hover:bg-[#e5d4a8]"
              >
                <Link href="/create">
                  <Plus className="size-3.5" />
                  <span className="hidden sm:inline">Create a market</span>
                  <span className="sm:hidden">Create</span>
                </Link>
              </Button>
            </div>
          </header>
          <div className={cn("flex-1 px-4 py-5 sm:px-6 lg:px-8", className)}>{children}</div>
        </SidebarInset>
    </SidebarProvider>
  );
}
