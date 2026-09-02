// Markets index — live board of range-trading opportunities.
import {
  AppShell,
  EmptyState,
  ErrorState,
  GhostLink,
  PageEyebrow,
  PageTitle,
  PrimaryLink,
} from "@/components/app/kaido-ui";
import { MarketsBoard } from "@/components/market/markets-board";
import { activeNetworkId } from "@/lib/stellar/networks";
import { isTradingWindowOpen } from "@/lib/market-display";
import { listMarkets } from "@/lib/stellar/kaido";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const network = activeNetworkId();
  let markets = null as Awaited<ReturnType<typeof listMarkets>> | null;
  let error: string | null = null;
  try {
    markets = await listMarkets();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const openCount =
    markets?.filter((m) => isTradingWindowOpen(m.status?.tag, m.info.window)).length ?? 0;

  return (
    <AppShell>
      <div className="space-y-12">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-5">
            <PageEyebrow>Live markets · {network}</PageEyebrow>
            <PageTitle
              title="Call the number"
              subtitle="Pick your payoff zone, press your conviction, and trade your edge against the crowd — not just yes or no."
            />
          </div>
          <PrimaryLink href="/create">Create a market</PrimaryLink>
        </div>

        {error ? (
          <ErrorState title="Couldn't load markets" body={error} />
        ) : markets && markets.length === 0 ? (
          <EmptyState
            title="No markets yet"
            body="Be the first to open a range market. Pick an outcome, set the oracle, seed the crowd curve."
            action={<PrimaryLink href="/create">Create a market</PrimaryLink>}
          />
        ) : markets ? (
          <MarketsBoard markets={markets} openCount={openCount} />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-8">
          <GhostLink href="/leaderboard">Calibration leaderboard</GhostLink>
          <GhostLink href="/whitepaper">How it works</GhostLink>
        </div>
      </div>
    </AppShell>
  );
}
