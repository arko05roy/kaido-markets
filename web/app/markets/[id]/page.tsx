/**
 * Single market page — live params + consensus distribution + a trade panel,
 * read on-chain (Sprint 5 "distribution mode", build.md E11). Belief input is
 * slider-driven (`web/components/forecast`), not freehand. `force-dynamic`:
 * every read is per-request and a testnet reset must not bake in stale ids.
 */
import { type KaidoConfig } from "@kaido/sdk";
import Link from "next/link";

import { ConsensusChart } from "@/components/forecast/consensus-chart";
import { type TradeMarketView } from "@/components/forecast/trade-panel";
import { RecentActivity } from "@/components/market/recent-activity";
import { type SettlementMarketView } from "@/components/market/settlement-panel";

import { MarketActions } from "./market-actions";
import { deployedConfig } from "@/lib/stellar/contracts";
import { fmtHouseUsdc, getHouseCap, getHouseExposure } from "@/lib/stellar/house";
import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";
import {
  WAD,
  formatWad,
  getBeliefs,
  getCheckpoints,
  getMarketInfo,
  getMarketState,
  getResolvedOutcomes,
  statusLabel,
  tierLabel,
  type MarketInfo,
  type MarketParams,
  type MarketState,
} from "@/lib/stellar/kaido";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

function fmtTime(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toUTCString();
}

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

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data:
    | {
        info: MarketInfo;
        params: MarketParams;
        state: MarketState;
        view: TradeMarketView;
        settlement: SettlementMarketView;
        resolved: string[];
      }
    | null = null;
  let error: string | null = null;
  try {
    const [info, { params: mp, state }, checkpoints] = await Promise.all([
      getMarketInfo(id),
      getMarketState(id),
      getCheckpoints(id),
    ]);
    const isTraj = mp.outcome_space.tag === "Trajectory";
    const beliefs = isTraj ? await getBeliefs(id) : [];
    const consensusMusWad = isTraj
      ? beliefs.map((b) => b.mu.toString())
      : [state.belief.mu.toString()];
    const consensusSigmasWad = isTraj
      ? beliefs.map((b) => b.sigma.toString())
      : [state.belief.sigma.toString()];
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
      checkpoints: checkpoints.map((c) => Number(c)),
      tradingOpen: state.status.tag === "Open",
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
    };
    data = { info, params: mp, state, view, settlement, resolved };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const config = kaidoConfig();
  let houseExposure: bigint | null = null;
  let houseCap: bigint | null = null;
  if (data) {
    try {
      const deployed = deployedConfig();
      const vaultId = deployed.fixtures.houseVault ?? deployed.contracts.houseVault;
      [houseExposure, houseCap] = await Promise.all([
        getHouseExposure(vaultId, id),
        getHouseCap(vaultId, id),
      ]);
    } catch {
      /* vault read optional */
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6 sm:p-10">
      <div>
        <Link href="/markets" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Markets
        </Link>
      </div>

      {error || !data ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Market</h1>
          <p className="font-mono text-sm text-muted-foreground">{id}</p>
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Couldn’t read this market.</p>
            <p className="mt-1">{error ?? "Unknown error."}</p>
          </div>
        </>
      ) : (
        <>
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {data.view.kind === "trajectory" ? "Trajectory market" : "Scalar market"}
              </h1>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {statusLabel(data.state.status)}
              </span>
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-medium"
                title="Resolver trust tier — rendered from on-chain state (ADR-5)"
              >
                {tierLabel(data.params.tier)}
              </span>
            </div>
            <p className="font-mono text-xs text-muted-foreground">{id}</p>
          </header>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Consensus distribution</h2>
            <ConsensusChart view={data.view} resolved={data.resolved.length ? data.resolved : undefined} />
          </section>

          {config ? (
            <section>
              <MarketActions config={config} tradeMarket={data.view} settlementMarket={data.settlement} />
            </section>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Trading is unavailable: the network / USDC SAC config isn’t resolved (run{" "}
              <code className="font-mono">make deploy:{activeNetworkId()}</code>).
            </p>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold">Parameters</h2>
            <dl className="rounded-lg border bg-card px-4">
              <Field label="k (liquidity)" value={`${Number(data.params.k) / Number(WAD)}`} />
              <Field label="b (collateral / outcome)" value={formatWad(data.params.b)} />
              <Field label="Fee" value={`${data.params.fee_bps / 100}%`} />
              <Field label="σ floor" value={formatWad(data.state.sigma_min)} />
              <Field label="Capped Gaussian" value={data.params.capped ? "yes" : "no"} />
              <Field
                label="Resolver"
                value={
                  <span className="font-mono text-xs">
                    {data.params.resolver.slice(0, 6)}…{data.params.resolver.slice(-6)}
                  </span>
                }
              />
            </dl>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Recent activity</h2>
            <RecentActivity marketId={id} />
          </section>

          {houseExposure != null && houseExposure > 0n && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">House liquidity</h2>
              <p className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
                HouseVault exposure:{" "}
                <span className="font-mono text-foreground">{fmtHouseUsdc(houseExposure)} USDC</span>
                {houseCap != null && houseCap > 0n && (
                  <>
                    {" "}
                    · cap{" "}
                    <span className="font-mono text-foreground">{fmtHouseUsdc(houseCap)} USDC</span>
                  </>
                )}
              </p>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold">Window (UTC)</h2>
            <dl className="rounded-lg border bg-card px-4">
              <Field label="Opens" value={fmtTime(data.params.window.open)} />
              <Field label="Locks" value={fmtTime(data.params.window.lock)} />
              <Field label="Resolves" value={fmtTime(data.params.window.resolve)} />
            </dl>
          </section>
        </>
      )}
    </main>
  );
}
