import Link from "next/link";

import { Button } from "@/components/ui/button";
import { activeNetworkId } from "@/lib/stellar/networks";

export default function Home() {
  const network = activeNetworkId();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Kaido</h1>
        <p className="max-w-md text-balance text-muted-foreground">
          Permissionless distribution markets on Stellar. ChartGuessr-on-BTC is
          the wedge. (Sprint 0 skeleton — nothing playable yet.)
        </p>
        <p className="text-xs text-muted-foreground">
          target network: <span className="font-mono">{network}</span>
        </p>
      </div>
      <nav className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/chartguessr">ChartGuessr</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/create">Create a market</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/leaderboard">Leaderboard</Link>
        </Button>
      </nav>
    </main>
  );
}
