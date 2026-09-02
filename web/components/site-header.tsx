"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ConnectButton } from "@/components/wallet/connect-button";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/create", label: "Create" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function SiteHeader({ network }: { network: string }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 border-b bg-background/80 px-4 py-2.5 backdrop-blur sm:px-6">
      <Link href="/" className="text-sm font-semibold tracking-tight">
        Kaido
      </Link>
      <span className="hidden font-mono text-[10px] uppercase text-muted-foreground sm:inline">{network}</span>
      <nav className="flex items-center gap-1 text-sm">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto">
        <ConnectButton />
      </div>
    </header>
  );
}
