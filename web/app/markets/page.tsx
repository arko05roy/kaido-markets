// Markets index — live board of range-trading opportunities.
import { MarketsBoard } from "@/components/market/markets-board";
import { MarketsFetchError } from "@/components/market/markets-fetch-error";
import { getMarketEvents } from "@/lib/indexer";
import { aggregateMarketStats24h } from "@/lib/market-stats";
import { GhostLink } from "@/components/app/kaido-ui";
import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";
import { loadMarketMetadataStore } from "@/lib/market-metadata-store";
import { isTradingWindowOpen } from "@/lib/market-display";
import { getLedgerNowSec } from "@/lib/stellar/ledger";
import { listMarkets } from "@/lib/stellar/kaido";
import type { MarketStats24h } from "@/lib/market-stats";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const network = activeNetworkId();
  let markets = null as Awaited<ReturnType<typeof listMarkets>> | null;
  let ledgerNowSec: number | null = null;
  let error: string | null = null;
  try {
    const [listed, ledger] = await Promise.all([listMarkets(), getLedgerNowSec()]);
    markets = listed;
    ledgerNowSec = ledger;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const openCount =
    markets?.filter((m) =>
      isTradingWindowOpen(m.status?.tag, m.info.window, ledgerNowSec ?? undefined),
    ).length ?? 0;
  const metadataByMarket = loadMarketMetadataStore()[network] ?? {};

  const statsByMarket: Record<string, MarketStats24h> = {};
  if (markets) {
    await Promise.all(
      markets.slice(0, 25).map(async (m) => {
        try {
          const events = await getMarketEvents(m.address, { limit: 150 });
          statsByMarket[m.address] = aggregateMarketStats24h(events);
        } catch {
          /* hide stats row */
        }
      }),
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[1400px] space-y-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.04),transparent_65%)]"
      />

      <div className="relative space-y-6">
        {error ? (
          <MarketsFetchError message={error} rpcHost={activeNetwork().rpcUrl} />
        ) : (
          <MarketsBoard
            markets={markets ?? []}
            openCount={openCount}
            network={network}
            metadataByMarket={metadataByMarket}
            statsByMarket={statsByMarket}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] pt-8">
          <GhostLink href="/leaderboard">Calibration leaderboard</GhostLink>
          <GhostLink href="/whitepaper">How it works</GhostLink>
        </div>
      </div>
    </div>
  );
}
