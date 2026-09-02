// Markets index — lists every market registered in the on-chain Registry.
// Server component: reads the chain directly via `@kaido/contract-bindings`
// (simulate-only). Next 16 App Router.
import Link from "next/link";

import { activeNetworkId } from "@/lib/stellar/networks";
import {
  checkpointsFromOutcomeSpace,
  listMarkets,
  statusLabel,
  tierLabel,
  type MarketCard,
} from "@/lib/stellar/kaido";

export const dynamic = "force-dynamic";

function StatusPill({ label }: { label: string }) {
  const tone =
    label === "Open"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : label === "Disputable"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

function MarketRow({ card }: { card: MarketCard }) {
  const { address, info, status } = card;
  const cpCount = checkpointsFromOutcomeSpace(info.outcome_space);
  const kind =
    info.outcome_space.tag === "Trajectory"
      ? `Trajectory · ${cpCount.length} checkpoints`
      : "Scalar";
  return (
    <Link
      href={`/markets/${address}`}
      className="group flex items-center justify-between gap-4 rounded-lg border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-accent/40"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">
            {address.slice(0, 6)}…{address.slice(-6)}
          </span>
          <StatusPill label={statusLabel(status)} />
        </div>
        <div className="text-xs text-muted-foreground">
          {kind} · {tierLabel(info.tier)}
        </div>
      </div>
      <span className="shrink-0 text-sm text-muted-foreground transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}

export default async function MarketsPage() {
  const network = activeNetworkId();
  let markets: MarketCard[] | null = null;
  let error: string | null = null;
  try {
    markets = await listMarkets();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6 sm:p-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Markets</h1>
        <p className="text-sm text-muted-foreground">
          Every distribution market registered on-chain.{" "}
          <span className="font-mono">{network}</span>
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Couldn’t read the registry.</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : markets && markets.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No markets yet.{" "}
          <Link href="/create" className="underline underline-offset-4">
            Create one →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {markets!.map((card) => (
            <MarketRow key={card.address} card={card} />
          ))}
        </div>
      )}
    </main>
  );
}
