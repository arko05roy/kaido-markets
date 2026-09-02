"use client";

import { usePathname } from "next/navigation";

import { Navbar1 } from "@/components/ui/navbar-1";

const DASHBOARD_PREFIXES = ["/markets", "/positions", "/create"];

/** Hide the landing pill navbar on dashboard routes that use the sidebar shell. */
export function ConditionalNavbar() {
  const pathname = usePathname();
  const hide =
    pathname != null &&
    DASHBOARD_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (hide) return null;

  return (
    <div className="absolute inset-x-0 top-0 z-30">
      <Navbar1 />
    </div>
  );
}
