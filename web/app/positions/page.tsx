import { PositionsBoard } from "@/components/positions/positions-board";
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
    <div className="mx-auto w-full max-w-[1400px]">
      {error ? (
        <p className="text-sm text-red-300">{error}</p>
      ) : (
        <PositionsBoard
          network={network}
          markets={markets ?? []}
          titlesByMarket={titlesByMarket}
          config={buildKaidoConfig()}
        />
      )}
    </div>
  );
}
