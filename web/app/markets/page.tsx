// Markets index — live board of range-trading opportunities.
import { ErrorState, GhostLink } from "@/components/app/kaido-ui";
import { MarketsBoard } from "@/components/market/markets-board";
import { activeNetworkId } from "@/lib/stellar/networks";
import { loadMarketMetadataStore } from "@/lib/market-metadata-store";
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
  const metadataByMarket = loadMarketMetadataStore()[network] ?? {};

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      {error ? (
        <ErrorState title="Couldn't load markets" body={error} />
      ) : (
        <MarketsBoard
          markets={markets ?? []}
          openCount={openCount}
          network={network}
          metadataByMarket={metadataByMarket}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] pt-8">
        <GhostLink href="/leaderboard">Calibration leaderboard</GhostLink>
        <GhostLink href="/whitepaper">How it works</GhostLink>
      </div>
    </div>
  );
}
