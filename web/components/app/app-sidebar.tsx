"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Crosshair,
  LayoutGrid,
  PlusCircle,
  Trophy,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const MAIN_NAV = [
  { href: "/markets", label: "Markets", icon: LayoutGrid },
  { href: "/positions", label: "Positions", icon: Crosshair },
  { href: "/create", label: "Create", icon: PlusCircle },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/whitepaper", label: "How it works", icon: BookOpen },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar
      variant="inset"
      collapsible="icon"
      className="[&_[data-slot=sidebar-inner]]:rounded-2xl [&_[data-slot=sidebar-inner]]:bg-[#18181b]"
    >
      <SidebarHeader className="px-3 py-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-sidebar-accent/60"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#d8c69a]/15 text-[#d8c69a]">
            <BarChart3 className="size-4" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-serif text-lg leading-none tracking-tight text-[#f3efe6]">
              Kaido
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/35">
              Belief markets
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarSeparator className="mx-3 bg-white/[0.06]" />

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {MAIN_NAV.map((item) => {
                const active =
                  pathname === item.href || pathname?.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className="h-10 rounded-xl font-mono text-[11px] uppercase tracking-[0.16em] data-[active=true]:bg-[#d8c69a]/12 data-[active=true]:text-[#d8c69a]"
                    >
                      <Link href={item.href}>
                        <Icon className="size-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4">
        <p className="px-2 font-mono text-[9px] uppercase tracking-[0.18em] text-white/30 group-data-[collapsible=icon]:hidden">
          Stellar testnet
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
