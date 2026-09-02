"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Crosshair,
  LayoutGrid,
  PlusCircle,
  Trophy,
} from "lucide-react";

import { NetworkBadge } from "@/components/app/dashboard-page-header";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  featured?: boolean;
};

const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: "Trade",
    items: [
      { href: "/markets", label: "Markets", icon: LayoutGrid },
      { href: "/positions", label: "Positions", icon: Crosshair },
    ],
  },
  {
    label: null,
    items: [{ href: "/create", label: "Create market", icon: PlusCircle, featured: true }],
  },
  {
    label: "Learn",
    items: [
      { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
      { href: "/whitepaper", label: "How it works", icon: BookOpen },
    ],
  },
];


function isNavActive(pathname: string | null, href: string) {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.label}
        className={cn(
          "h-10 rounded-xl border border-transparent pl-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-white/45",
          "transition-[background-color,border-color,color,box-shadow] duration-150",
          "hover:bg-white/[0.04] hover:text-white/70",
          "data-[active=true]:border-l-[3px] data-[active=true]:border-[#d8c69a]/50 data-[active=true]:bg-[#d8c69a]/10",
          "data-[active=true]:pl-[calc(0.625rem-3px)] data-[active=true]:text-[#d8c69a]",
          "data-[active=true]:shadow-[inset_0_1px_0_0_rgba(216,198,154,0.08)]",
          item.featured &&
            !active &&
            "border-[#d8c69a]/20 bg-[#d8c69a]/[0.07] text-[#d8c69a] hover:bg-[#d8c69a]/10 hover:text-[#f3efe6]",
          item.featured &&
            active &&
            "border-[#d8c69a]/30 bg-[#d8c69a]/12 text-[#f3efe6]",
        )}
      >
        <Link href={item.href}>
          <Icon className={cn("size-4", active || item.featured ? "text-[#d8c69a]" : "text-white/40")} />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet";

  return (
    <Sidebar
      variant="inset"
      collapsible="icon"
      className={cn(
        "[&_[data-slot=sidebar-inner]]:relative [&_[data-slot=sidebar-inner]]:overflow-hidden",
        "[&_[data-slot=sidebar-inner]]:rounded-2xl [&_[data-slot=sidebar-inner]]:border [&_[data-slot=sidebar-inner]]:border-white/[0.06]",
        "[&_[data-slot=sidebar-inner]]:bg-[#1c1c21]",
        "[&_[data-slot=sidebar-inner]]:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
        "[&_[data-slot=sidebar-inner]]:before:pointer-events-none [&_[data-slot=sidebar-inner]]:before:absolute",
        "[&_[data-slot=sidebar-inner]]:before:inset-y-0 [&_[data-slot=sidebar-inner]]:before:left-0 [&_[data-slot=sidebar-inner]]:before:w-px",
        "[&_[data-slot=sidebar-inner]]:before:bg-[#d8c69a]/20",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-0 h-40 w-full bg-[radial-gradient(ellipse_at_top_left,rgba(216,198,154,0.08),transparent_70%)]"
      />

      <SidebarHeader className="relative z-10 px-3 pb-2 pt-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.04]"
        >
          <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-serif text-4xl leading-none tracking-[-0.02em] text-[#f3efe6]">
              kaido.fun
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarSeparator className="relative z-10 mx-3 bg-white/[0.06]" />

      <SidebarContent className="relative z-10 gap-4 px-2 py-4">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label ?? "create"} className="p-0">
            {group.label && (
              <SidebarGroupLabel className="h-7 px-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isNavActive(pathname, item.href)}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
