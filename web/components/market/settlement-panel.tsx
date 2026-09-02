"use client";

/**
 * Post-trade lifecycle on /markets/[id]: window phase, resolve, claim payouts.
 */
import { Kaido, type KaidoConfig, distributionMarket } from "@kaido/sdk";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ResultCard } from "@/components/market/result-card";
import { useWallet } from "@/components/wallet/provider";
import { fromWad, toWad } from "@/lib/curve";
import { fetchWalletPositions } from "@/lib/indexer/wallet-positions";
import {
  formatUsdc7dp,
  loadPositions,
  markClaimed,
  savePosition,
  type SavedPosition,
} from "@/lib/positions";

export interface SettlementMarketView {
  address: string;
  kind: "scalar" | "trajectory";
  statusTag: "Open" | "Locked" | "Resolved" | "ResolvedVec" | "Disputable";
  windowOpen: number;
  windowLock: number;
  windowResolve: number;
  kWad?: string;
  bWad?: string;
  /** Resolved outcome value(s) in WAD, if known. */
  resolvedWad?: string[];
  /** On-chain resolver tier (for T3 report UI). */
  resolverTier?: number;
  resolver?: string;
  capped?: boolean;
}

type Phase = "open" | "locked" | "awaiting_resolve" | "resolved" | "disputable";

function derivePhase(view: SettlementMarketView, nowSec: number): Phase {
  if (view.statusTag === "Disputable") return "disputable";
  if (view.statusTag === "Resolved" || view.statusTag === "ResolvedVec") return "resolved";
  if (view.statusTag === "Locked") return nowSec >= view.windowResolve ? "awaiting_resolve" : "locked";
  if (nowSec >= view.windowResolve) return "awaiting_resolve";
  if (nowSec >= view.windowLock) return "locked";
  return "open";
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "open":
      return "Trading open";
    case "locked":
      return "Trading closed — awaiting resolution";
    case "awaiting_resolve":
      return "Ready to resolve";
    case "resolved":
      return "Resolved — claim your positions";
    case "disputable":
      return "Disputable — resolver stale or contested";
  }
}

function fmtCountdown(targetSec: number, nowSec: number): string {
  const delta = Math.max(0, targetSec - nowSec);
  if (delta === 0) return "now";
  const h = Math.floor(delta / 3600);
  const m = Math.floor((delta % 3600) / 60);
  const s = delta % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function mergePositions(local: SavedPosition[], chainIds: string[]): SavedPosition[] {
  const byId = new Map<string, SavedPosition>();
  for (const id of chainIds) {
    if (!byId.has(id)) byId.set(id, { id, openedAt: 0 });
  }
  for (const p of local) {
    const cur = byId.get(p.id);
    byId.set(p.id, cur ? { ...cur, ...p, openedAt: p.openedAt || cur.openedAt } : p);
  }
  return [...byId.values()].sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
}

export function SettlementPanel({
  config,
  market,
  refreshKey = 0,
}: {
  config: KaidoConfig;
  market: SettlementMarketView;
  /** Bump after a trade so we reload saved positions. */
  refreshKey?: number;
}) {
  const { wallet } = useWallet();
  const kaido = useMemo(() => new Kaido(config), [config]);

  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [resolving, setResolving] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvedOverride, setResolvedOverride] = useState<bigint[] | null>(null);
  const [chainIds, setChainIds] = useState<string[]>([]);
  const [loadingChain, setLoadingChain] = useState(false);
  const [manualId, setManualId] = useState("");
  const [positionsEpoch, bumpPositionsEpoch] = useState(0);
  const [reportValue, setReportValue] = useState("");
  const [reporting, setReporting] = useState(false);
  const [feeBusy, setFeeBusy] = useState<"treasury" | "creator" | null>(null);
  const [pendingFees, setPendingFees] = useState<{ treasury: bigint; creator: bigint } | null>(null);
  const [lastClaim, setLastClaim] = useState<{
    positionId: string;
    payout7dp: bigint;
    belief?: { muWad: bigint; sigmaWad: bigint };
    collateral7dp?: bigint;
  } | null>(null);

  const localPositions: SavedPosition[] = wallet
    ? loadPositions(config.network, wallet.signer.accountId, market.address)
    : [];
  const positions = mergePositions(localPositions, chainIds);

  useEffect(() => {
    if (!wallet) {
      setChainIds([]);
      return;
    }
    let cancelled = false;
    setLoadingChain(true);
    void fetchWalletPositions(config.rpcUrl, market.address, wallet.signer.accountId)
      .then((rows) => {
        if (cancelled) return;
        setChainIds(rows.map((r) => r.id));
        for (const r of rows) {
          savePosition(config.network, wallet.signer.accountId, market.address, BigInt(r.id));
        }
      })
      .catch(() => {
        if (!cancelled) setChainIds([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingChain(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, config.rpcUrl, config.network, market.address, refreshKey, positionsEpoch]);

  const resolvedFromProps = useMemo(
    () => (market.resolvedWad?.length ? market.resolvedWad.map((x) => BigInt(x)) : null),
    [market.resolvedWad],
  );
  const resolvedOutcomes = resolvedOverride ?? resolvedFromProps;

  const phase = derivePhase(market, nowSec);
  const canResolve = phase === "awaiting_resolve" || (phase === "locked" && nowSec >= market.windowResolve);
  const isResolved = phase === "resolved";

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const isT3 = market.resolverTier === distributionMarket.ResolverTier.Designated;
  const canReportT3 =
    wallet &&
    isT3 &&
    market.resolver &&
    !isResolved &&
    nowSec >= market.windowResolve;

  useEffect(() => {
    let cancelled = false;
    void kaido
      .market(market.address)
      .pending_fees()
      .then((t) => {
        if (cancelled) return;
        const [treasury, creator] = t.result as [bigint, bigint];
        setPendingFees({ treasury: BigInt(treasury), creator: BigInt(creator) });
      })
      .catch(() => {
        if (!cancelled) setPendingFees(null);
      });
    return () => {
      cancelled = true;
    };
  }, [kaido, market.address, refreshKey, positionsEpoch]);

  const reportT3 = useCallback(async () => {
    if (!wallet || !market.resolver) return;
    const v = Number(reportValue.trim());
    if (!Number.isFinite(v)) {
      setError("enter a numeric outcome");
      return;
    }
    setReporting(true);
    setError(null);
    try {
      await kaido.reportDesignatedOutcome(market.resolver, toWad(v), wallet.signer);
      setReportValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "report failed");
    } finally {
      setReporting(false);
    }
  }, [wallet, market.resolver, reportValue, kaido]);

  const claimFees = useCallback(
    async (which: "treasury" | "creator") => {
      if (!wallet) return;
      setFeeBusy(which);
      setError(null);
      try {
        const out =
          which === "treasury"
            ? await kaido.claimTreasuryFees(market.address, wallet.signer)
            : await kaido.claimCreatorFees(market.address, wallet.signer);
        setPendingFees((prev) =>
          prev
            ? {
                ...prev,
                [which]: 0n,
              }
            : prev,
        );
        return out;
      } catch (e) {
        setError(e instanceof Error ? e.message : `${which} fee claim failed`);
        return null;
      } finally {
        setFeeBusy(null);
      }
    },
    [wallet, kaido, market.address],
  );

  const resolveMarket = useCallback(async () => {
    if (!wallet) return;
    setResolving(true);
    setError(null);
    try {
      try {
        await kaido.resolve(market.address, wallet.signer);
      } catch {
        /* already resolved */
      }
      const outcomes = (await kaido.market(market.address).resolved_outcomes()).result as bigint[];
      if (outcomes.length) {
        setResolvedOverride(outcomes.map((x) => BigInt(x)));
      } else {
        const state = await kaido.getMarket(market.address);
        if (state.state.status.tag === "Resolved") {
          setResolvedOverride([BigInt(state.state.status.values[0])]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "resolve failed");
    } finally {
      setResolving(false);
    }
  }, [wallet, kaido, market.address]);

  const bumpClaim = () => bumpPositionsEpoch((n) => n + 1);

  const claimPosition = useCallback(
    async (positionId: string) => {
      if (!wallet) return;
      setClaimingId(positionId);
      setError(null);
      try {
        const id = BigInt(positionId);
        const saved = loadPositions(config.network, wallet.signer.accountId, market.address).find(
          (p) => p.id === positionId,
        );
        const payout =
          market.kind === "trajectory"
            ? await kaido.claimTrajectory(market.address, id, wallet.signer)
            : await kaido.claim(market.address, id, wallet.signer);
        markClaimed(config.network, wallet.signer.accountId, market.address, id, payout);
        setLastClaim({
          positionId,
          payout7dp: payout,
          belief:
            saved?.muWad && saved?.sigmaWad
              ? { muWad: BigInt(saved.muWad), sigmaWad: BigInt(saved.sigmaWad) }
              : undefined,
          collateral7dp: saved?.collateral7dp ? BigInt(saved.collateral7dp) : undefined,
        });
        bumpClaim();
        return payout;
      } catch (e) {
        setError(e instanceof Error ? e.message : "claim failed");
        return null;
      } finally {
        setClaimingId(null);
      }
    },
    [wallet, kaido, market.address, market.kind, config.network],
  );

  const nextEvent =
    phase === "open"
      ? { label: "Trading locks", at: market.windowLock }
      : phase === "locked"
        ? { label: "Resolves", at: market.windowResolve }
        : null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4" data-positions-epoch={refreshKey}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Settlement</h2>
        <p className="mt-1 text-sm text-muted-foreground">{phaseLabel(phase)}</p>
        {nextEvent && (
          <p className="mt-1 text-xs text-muted-foreground">
            {nextEvent.label} in {fmtCountdown(nextEvent.at, nowSec)} (
            {new Date(nextEvent.at * 1000).toLocaleString()})
          </p>
        )}
      </div>

      {resolvedOutcomes?.length ? (
        <p className="text-sm">
          Outcome:{" "}
          <span className="font-mono">
            {resolvedOutcomes.map((x) => fromWad(x).toPrecision(6)).join(" · ")}
          </span>
        </p>
      ) : null}

      {pendingFees && (pendingFees.treasury > 0n || pendingFees.creator > 0n) && wallet && (
        <div className="rounded-md border px-3 py-2 text-sm">
          <p className="font-medium">Accrued protocol fees</p>
          <p className="text-xs text-muted-foreground">
            Treasury: {formatUsdc7dp(pendingFees.treasury / 10_000_000_000n)} USDC · Creator:{" "}
            {formatUsdc7dp(pendingFees.creator / 10_000_000_000n)} USDC
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pendingFees.treasury > 0n && (
              <Button
                size="sm"
                variant="outline"
                disabled={feeBusy != null}
                onClick={() => void claimFees("treasury")}
              >
                {feeBusy === "treasury" ? "Claiming…" : "Claim treasury fees"}
              </Button>
            )}
            {pendingFees.creator > 0n && (
              <Button
                size="sm"
                variant="outline"
                disabled={feeBusy != null}
                onClick={() => void claimFees("creator")}
              >
                {feeBusy === "creator" ? "Claiming…" : "Claim creator fees"}
              </Button>
            )}
          </div>
        </div>
      )}

      {canReportT3 && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed px-3 py-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">T3 designated report (outcome value)</span>
            <input
              type="text"
              value={reportValue}
              onChange={(e) => setReportValue(e.target.value)}
              placeholder="e.g. 65000"
              className="w-40 rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <Button size="sm" onClick={() => void reportT3()} disabled={reporting || !reportValue.trim()}>
            {reporting ? "Reporting…" : "Report outcome"}
          </Button>
        </div>
      )}

      {wallet && canResolve && !isResolved && (
        <Button size="sm" onClick={() => void resolveMarket()} disabled={resolving}>
          {resolving ? <Loader2 className="size-4 animate-spin" /> : null}
          {resolving ? "Resolving…" : "Resolve market"}
        </Button>
      )}

      {wallet && isResolved && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Your positions</h3>
          {loadingChain && positions.length === 0 && (
            <p className="text-xs text-muted-foreground">Loading on-chain trades…</p>
          )}
          {positions.length > 0 ? (
            <ul className="space-y-2">
              {positions.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="font-mono">#{p.id}</span>
                  {p.claimedAt != null && p.payout7dp != null ? (
                    <span className="text-muted-foreground">
                      Claimed · {formatUsdc7dp(BigInt(p.payout7dp))} USDC
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={claimingId === p.id}
                      onClick={() => void claimPosition(p.id)}
                    >
                      {claimingId === p.id ? <Loader2 className="size-4 animate-spin" /> : null}
                      {claimingId === p.id ? "Claiming…" : "Claim payout"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            !loadingChain && (
              <p className="text-sm text-muted-foreground">
                No open positions found for this wallet on this market.
              </p>
            )
          )}
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Claim by position #</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 1"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                className="w-32 rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={!manualId.trim() || claimingId != null}
              onClick={() => void claimPosition(manualId.trim())}
            >
              Claim
            </Button>
          </div>
        </div>
      )}

      {!wallet && (
        <p className="text-sm text-muted-foreground">Connect a wallet to resolve or claim payouts.</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {lastClaim && resolvedOutcomes?.length && market.kWad && market.bWad && market.kind === "scalar" && (
        <ResultCard
          marketLabel="Scalar market"
          kind="scalar"
          market={{ kWad: BigInt(market.kWad), bWad: BigInt(market.bWad) }}
          yourBelief={lastClaim.belief}
          resolvedWad={resolvedOutcomes}
          collateral7dp={lastClaim.collateral7dp}
          payout7dp={lastClaim.payout7dp}
          positionId={lastClaim.positionId}
        />
      )}
    </div>
  );
}
