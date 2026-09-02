import { PositionsBoard } from "@/components/positions/positions-board";
import { ErrorState, Panel } from "@/components/app/kaido-ui";
import { displayMarketQuestion } from "@/lib/market-metadata";
import { buildKaidoConfig } from "@/lib/kaido-config";
import { loadMarketMetadataStore } from "@/lib/market-metadata-store";
import { activeNetworkId } from "@/lib/stellar/networks";
import { listMarkets } from "@/lib/stellar/kaido";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const network = activeNetworkId();
  let markets = null as Awaited<ReturnType<typeof listMarkets>> | null;
  let error: string | null = null;
  try {
    markets = await listMarkets();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const metadata = loadMarketMetadataStore()[network] ?? {};
  const titlesByMarket: Record<string, string> = {};
  for (const m of markets ?? []) {
    titlesByMarket[m.address] = displayMarketQuestion(
      m.info,
      m.crowdMuWad,
      metadata[m.address]?.question,
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[1400px] space-y-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.04),transparent_65%)]"
      />

      <div className="relative">
        {error ? (
          <Panel className="px-6 py-8">
            <ErrorState title="Couldn't load positions" body={error} />
          </Panel>
        ) : (
          <PositionsBoard
            network={network}
            markets={markets ?? []}
            titlesByMarket={titlesByMarket}
            config={buildKaidoConfig()}
          />
        )}
      </div>
    </div>
  );
}
