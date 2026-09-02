/**
 * /markets/[id] — trading venue: crowd curve + sticky belief ticket.
 */
import { type KaidoConfig } from "@kaido/sdk";

import { AdvancedBlock } from "@/components/app/advanced-block";
import { DashboardPageHeader } from "@/components/app/dashboard-page-header";
import {
  ErrorState,
  Panel,
  StatusPill,
} from "@/components/app/kaido-ui";
import { ConsensusChart } from "@/components/forecast/consensus-chart";
import { type TradeMarketView } from "@/components/forecast/trade-panel";
import { MarketTradingLayout } from "@/components/market/market-trading-layout";
import { MarketVitals } from "@/components/market/market-vitals";
import { RecentActivity } from "@/components/market/recent-activity";
import { type SettlementMarketView } from "@/components/market/settlement-panel";
import {
  crowdTargetLabel,
  formatUsdc7dp,
  isTradingWindowOpen,
  marketSubtitle,
} from "@/lib/market-display";
import { displayMarketQuestion } from "@/lib/market-metadata";
import { getSavedMarketQuestion } from "@/lib/market-metadata-store";

import { MarketActions } from "./market-actions";
import { deployedConfig } from "@/lib/stellar/contracts";
import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";
import {
  getBeliefs,
  checkpointsFromOutcomeSpace,
  getBlendBackedDepth,
  getMarketInfo,
  getMarketState,
  getResolvedOutcomes,
  statusLabel,
  tierLabel,
  type MarketParams,
  type MarketState,
} from "@/lib/stellar/kaido";

export const dynamic = "force-dynamic";

function kaidoConfig(): KaidoConfig | null {
  try {
    const net = activeNetwork();
    if (!net.rpcUrl) return null;
    const d = deployedConfig();
    const usdcSacId = d.external.usdcSacId ?? process.env.NEXT_PUBLIC_KAIDO_USDC_SAC;
    if (!usdcSacId) return null;
    return {
      network: activeNetworkId(),
      rpcUrl: net.rpcUrl,
      networkPassphrase: net.networkPassphrase,
      contracts: { marketFactory: d.contracts.marketFactory, registry: d.contracts.registry },
      usdcSacId,
    };
  } catch {
    return null;
  }
}

function fmtTime(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] py-2.5 last:border-0">
      <dt className="text-xs text-white/40">{label}</dt>
      <dd className="text-right text-sm text-[#f3efe6]">{value}</dd>
    </div>
  );
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

  const config = kaidoConfig();
  const savedQuestion = getSavedMarketQuestion(activeNetworkId(), id);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      {error || !data ? (
        <>
          <DashboardPageHeader
            back={{ href: "/markets", label: "← All markets" }}
            title="Market unavailable"
            description="This market could not be loaded from chain."
          />
          <Panel className="px-6 py-8">
            <ErrorState title="Couldn't read this market" body={error ?? "Unknown error."} />
          </Panel>
        </>
      ) : (
        <>
          <DashboardPageHeader
            back={{ href: "/markets", label: "← All markets" }}
            title={displayMarketQuestion(data.params, data.crowdMuWad, savedQuestion)}
            titleClassName="font-serif text-xl font-normal leading-snug sm:text-2xl"
            badge={<StatusPill label={statusLabel(data.state.status)} />}
            description={marketSubtitle(data.params, data.crowdMuWad)}
            footer={
              <MarketVitals
                crowdTarget={crowdTargetLabel(data.crowdMuWad)}
                closesAt={Number(data.params.window.lock)}
                statusTag={data.state.status.tag}
                blendBackedDepth7dp={data.blendBackedDepth7dp}
              />
            }
          />
          <MarketTradingLayout
            chartLabel="Payoff zone · crowd target"
            chart={
              <Panel className="p-4 sm:p-5">
                <ConsensusChart
                  view={data.view}
                  resolved={data.resolved.length ? data.resolved : undefined}
                />
              </Panel>
            }
            ticket={
              config ? (
                <MarketActions
                  config={config}
                  tradeMarket={data.view}
                  settlementMarket={data.settlement}
                  lpMarket={data.lpMarket}
                />
              ) : (
                <Panel className="px-6 py-8">
                  <ErrorState
                    title="Trading unavailable"
                    body="This network isn't configured for trading yet."
                  />
                </Panel>
              )
            }
            below={
              <AdvancedBlock title="Market details">
                <div className="space-y-6">
                  <Panel className="px-4">
                    <dl>
                      <DetailRow
                        label="Market type"
                        value={data.view.kind === "trajectory" ? "Trajectory" : "Scalar"}
                      />
                      <DetailRow label="Fee" value={`${data.params.fee_bps / 100}%`} />
                      {data.blendBackedDepth7dp > 0n && (
                        <DetailRow
                          label="Blend depth"
                          value={`${formatUsdc7dp(data.blendBackedDepth7dp)} USDC`}
                        />
                      )}
                      <DetailRow label="Oracle" value={tierLabel(data.params.tier)} />
                      <DetailRow label="Trading opens" value={fmtTime(data.params.window.open)} />
                      <DetailRow label="Trading locks" value={fmtTime(data.params.window.lock)} />
                      <DetailRow label="Resolves" value={fmtTime(data.params.window.resolve)} />
                      <DetailRow
                        label="Contract"
                        value={
                          <span className="font-mono text-xs">
                            {id.slice(0, 8)}…{id.slice(-8)}
                          </span>
                        }
                      />
                    </dl>
                  </Panel>
                  <div>
                    <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                      Recent activity
                    </p>
                    <RecentActivity marketId={id} />
                  </div>
                </div>
              </AdvancedBlock>
            }
          />
        </>
      )}
    </div>
  );
}
