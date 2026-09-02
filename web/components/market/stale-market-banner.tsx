"use client";

import Link from "next/link";

export function StaleMarketBanner({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
      Trading closed on this market.{" "}
      <Link href="/markets" className="font-mono text-[#d8c69a] underline underline-offset-2">
        Browse open markets
      </Link>{" "}
      or{" "}
      <Link href="/create" className="font-mono text-[#d8c69a] underline underline-offset-2">
        create a new one
      </Link>
      .
    </div>
  );
}
