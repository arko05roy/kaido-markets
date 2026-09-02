/**
 * /markets/[id] — trading venue: crowd curve + sticky belief ticket.
 */
import type { Metadata } from "next";

import { ErrorState, Panel } from "@/components/app/kaido-ui";
import { type TradeMarketView } from "@/components/forecast/trade-panel";
import { MarketDetailHeader } from "@/components/market/market-detail-header";
import { MarketDetailClient } from "@/components/market/market-detail-client";
import { type SettlementMarketView } from "@/components/market/settlement-panel";
import {
  crowdTargetLabel,
  formatUsdc7dp,
  isTradingWindowOpen,
  marketSubtitle,
} from "@/lib/market-display";
import { displayMarketQuestion } from "@/lib/market-metadata";
import { getSavedMarketQuestion } from "@/lib/market-metadata-store";
import { getMarketEvents } from "@/lib/indexer";
import { aggregateMarketStats24h } from "@/lib/market-stats";

import { buildKaidoConfig } from "@/lib/kaido-config";
import { activeNetworkId } from "@/lib/stellar/networks";
import {
  getBeliefs,
  getBlendBackedDepth,
  getMarketInfo,
  getMarketState,
  getResolvedOutcomes,
  statusLabel,
  tierLabel,
  type MarketParams,
  type MarketState,
} from "@/lib/stellar/kaido";
import { checkpointsFromOutcomeSpace } from "@/lib/outcome-space";

export const dynamic = "force-dynamic";

function fmtTime(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const saved = getSavedMarketQuestion(activeNetworkId(), id);
    const title = saved ?? `Market ${id.slice(0, 8)}…`;
    return {
      title: `${title} · Kaido`,
      description: "Trade your belief on a distribution market — on Stellar testnet.",
      openGraph: {
        title,
        description: "Call the number. Press conviction. Place belief.",
        type: "website",
      },
    };
  } catch {
    return { title: "Market · Kaido" };
  }
}

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data:
    | {
        params: MarketParams;
        state: MarketState;
        view: TradeMarketView;
        settlement: SettlementMarketView;
        lpMarket: { id: string; bWad: string; canAdd: boolean; canRemove: boolean };
        resolved: string[];
        crowdMuWad: bigint;
        blendBackedDepth7dp: bigint;
      }
    | null = null;
  let error: string | null = null;
  try {
    const [, { params: mp, state }] = await Promise.all([
      getMarketInfo(id),
      getMarketState(id),
    ]);
    const blendBackedDepth7dp = await getBlendBackedDepth(id);
    const isTraj = mp.outcome_space.tag === "Trajectory";
    const beliefs = isTraj ? await getBeliefs(id) : [];
    const checkpoints = checkpointsFromOutcomeSpace(mp.outcome_space);
    const consensusMusWad = isTraj
      ? beliefs.map((b) => b.mu.toString())
      : [state.belief.mu.toString()];
    const consensusSigmasWad = isTraj
      ? beliefs.map((b) => b.sigma.toString())
      : [state.belief.sigma.toString()];
    const crowdMuWad = isTraj
      ? (beliefs[0]?.mu ?? state.belief.mu)
      : state.belief.mu;
    const resolved =
      state.status.tag === "Resolved"
        ? [state.status.values[0].toString()]
        : state.status.tag === "ResolvedVec"
          ? (await getResolvedOutcomes(id)).map((x) => x.toString())
          : [];
    const view: TradeMarketView = {
      address: id,
      kind: isTraj ? "trajectory" : "scalar",
      kWad: mp.k.toString(),
      bWad: mp.b.toString(),
      consensusMusWad,
      consensusSigmasWad,
      checkpoints,
      statusTag: state.status.tag,
      tradingOpen: isTradingWindowOpen(state.status.tag, mp.window),
      windowOpen: Number(mp.window.open),
      windowLock: Number(mp.window.lock),
      capped: mp.capped,
      feeBps: mp.fee_bps,
    };
    const settlement: SettlementMarketView = {
      address: id,
      kind: isTraj ? "trajectory" : "scalar",
      statusTag: state.status.tag,
      windowOpen: Number(mp.window.open),
      windowLock: Number(mp.window.lock),
      windowResolve: Number(mp.window.resolve),
      kWad: mp.k.toString(),
      bWad: mp.b.toString(),
      resolvedWad: resolved.length ? resolved : undefined,
      resolverTier: mp.tier,
      resolver: mp.resolver,
      capped: mp.capped,
    };
    const lpMarket = {
      id,
      bWad: mp.b.toString(),
      canAdd: state.status.tag === "Open",
      canRemove: state.status.tag === "Open" || state.status.tag === "Resolved" || state.status.tag === "ResolvedVec",
    };
    data = { params: mp, state, view, settlement, resolved, lpMarket, crowdMuWad, blendBackedDepth7dp };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const config = buildKaidoConfig();
  const savedQuestion = getSavedMarketQuestion(activeNetworkId(), id);
  const marketTitle =
    data && !error
      ? displayMarketQuestion(data.params, data.crowdMuWad, savedQuestion)
      : "";

  let stats24h = null as ReturnType<typeof aggregateMarketStats24h> | null;
  if (data && !error) {
    try {
      const events = await getMarketEvents(id, { limit: 150 });
      stats24h = aggregateMarketStats24h(events);
    } catch {
      stats24h = null;
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-[1400px] space-y-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-0 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(216,198,154,0.04),transparent_65%)]"
      />

      <div className="relative space-y-6">
        {error || !data ? (
          <>
            <MarketDetailHeader
              backLabel="All markets"
              title="Market unavailable"
              subtitle="This market could not be loaded from chain."
              status="Unknown"
              closesAt={0}
              statusTag="Open"
            />
            <Panel className="px-6 py-8">
              <ErrorState title="Couldn't read this market" body={error ?? "Unknown error."} />
            </Panel>
          </>
        ) : (
          <>
            <MarketDetailHeader
              title={displayMarketQuestion(data.params, data.crowdMuWad, savedQuestion)}
              subtitle={marketSubtitle(data.params, data.crowdMuWad)}
              status={statusLabel(data.state.status)}
              crowdTarget={crowdTargetLabel(data.crowdMuWad)}
              closesAt={Number(data.params.window.lock)}
              statusTag={data.state.status.tag}
              blendBackedDepth7dp={data.blendBackedDepth7dp}
              volumeUsdc={stats24h?.volumeUsdc ?? undefined}
              crowdMovedPct={stats24h?.crowdMovedPct ?? undefined}
            />
            {config ? (
              <MarketDetailClient
                config={config}
                view={data.view}
                settlement={data.settlement}
                lpMarket={data.lpMarket}
                marketTitle={marketTitle}
                resolved={data.resolved.length ? data.resolved : undefined}
                stats24h={stats24h ?? undefined}
                marketId={id}
                crowdMuWad={data.crowdMuWad}
                detailRows={[
                {
                  label: "Market type",
                  value: data.view.kind === "trajectory" ? "Trajectory" : "Scalar",
                },
                { label: "Fee", value: `${data.params.fee_bps / 100}%` },
                ...(data.blendBackedDepth7dp > 0n
                  ? [
                      {
                        label: "Blend depth",
                        value: `${formatUsdc7dp(data.blendBackedDepth7dp)} USDC`,
                      },
                    ]
                  : []),
                { label: "Oracle", value: tierLabel(data.params.tier) },
                { label: "Trading opens", value: fmtTime(data.params.window.open) },
                { label: "Trading locks", value: fmtTime(data.params.window.lock) },
                { label: "Resolves", value: fmtTime(data.params.window.resolve) },
                {
                  label: "Contract",
                  value: (
                    <span className="font-mono text-xs">
                      {id.slice(0, 8)}…{id.slice(-8)}
                    </span>
                  ),
                },
                ]}
              />
            ) : (
            <Panel className="px-6 py-8">
              <ErrorState
                title="Trading unavailable"
                body="This network isn't configured for trading yet."
              />
            </Panel>
          )}
          </>
        )}
      </div>
    </div>
  );
}
