"use client";

/**
 * Post-trade lifecycle on /markets/[id]: window phase, resolve, claim payouts.
 */
import { Kaido, type KaidoConfig, distributionMarket, resolverAttested, resolverOptimistic } from "@kaido/sdk";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { AdvancedBlock } from "@/components/app/advanced-block";
import {
  ClaimReceiptModal,
  ClaimSuccessModal,
  DisputeInfoModal,
} from "@/components/modals/claim-modals";
import { ResultCard } from "@/components/market/result-card";
import { useLedgerNow } from "@/components/providers/ledger-time-provider";
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
import { clientSettlementAsset } from "@/lib/settlement-asset";

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
      return "Trading is open";
    case "locked":
      return "Trading closed — waiting for the outcome";
    case "awaiting_resolve":
      return "Outcome pending";
    case "resolved":
      return "Claim your payout";
    case "disputable":
      return "Outcome disputed";
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
  const sym = clientSettlementAsset().symbol;
  const { wallet } = useWallet();
  const kaido = useMemo(() => new Kaido(config), [config]);

  const { nowSec } = useLedgerNow();
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
  const [attestedSig, setAttestedSig] = useState<{
    valueWad: bigint;
    reportedAt: bigint;
    signature: Buffer;
  } | null>(null);
  const [attestedPhase, setAttestedPhase] = useState<number | null>(null);
  const [optPhase, setOptPhase] = useState<number | null>(null);
  const [optBond, setOptBond] = useState("1");
  const [optAltValue, setOptAltValue] = useState("");
  const [resolverBusy, setResolverBusy] = useState<string | null>(null);
  const [feeBusy, setFeeBusy] = useState<"treasury" | "creator" | null>(null);
  const [pendingFees, setPendingFees] = useState<{ treasury: bigint; creator: bigint } | null>(null);
  const [lastClaim, setLastClaim] = useState<{
    positionId: string;
    payout7dp: bigint;
    belief?: { muWad: bigint; sigmaWad: bigint };
    collateral7dp?: bigint;
  } | null>(null);
  const [claimReceiptOpen, setClaimReceiptOpen] = useState(false);
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  const [claimSuccessOpen, setClaimSuccessOpen] = useState(false);
  const [claimSuccessPayout, setClaimSuccessPayout] = useState<bigint | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);

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

  const isT3 = market.resolverTier === distributionMarket.ResolverTier.Designated;
  const isT1 = market.resolverTier === distributionMarket.ResolverTier.Attested;
  const isT2 = market.resolverTier === distributionMarket.ResolverTier.Optimistic;
  const canReportT3 =
    wallet &&
    isT3 &&
    market.resolver &&
    !isResolved &&
    nowSec >= market.windowResolve;

  useEffect(() => {
    if (!market.resolver || !isT1) {
      setAttestedPhase(null);
      return;
    }
    let cancelled = false;
    void new resolverAttested.Client({
      contractId: market.resolver,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      allowHttp: config.rpcUrl.startsWith("http://"),
    })
      .phase()
      .then((t) => {
        if (!cancelled) setAttestedPhase(Number(t.result));
      })
      .catch(() => {
        if (!cancelled) setAttestedPhase(null);
      });
    return () => {
      cancelled = true;
    };
  }, [market.resolver, isT1, config, refreshKey, positionsEpoch]);

  useEffect(() => {
    if (!market.resolver || !isT2) {
      setOptPhase(null);
      return;
    }
    let cancelled = false;
    void new resolverOptimistic.Client({
      contractId: market.resolver,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      allowHttp: config.rpcUrl.startsWith("http://"),
    })
      .phase()
      .then((t) => {
        if (!cancelled) setOptPhase(Number(t.result));
      })
      .catch(() => {
        if (!cancelled) setOptPhase(null);
      });
    return () => {
      cancelled = true;
    };
  }, [market.resolver, isT2, config, refreshKey, positionsEpoch]);

  const canT1Actions =
    wallet && isT1 && market.resolver && !isResolved && nowSec >= market.windowResolve;
  const canT2Actions =
    wallet && isT2 && market.resolver && !isResolved && nowSec >= market.windowResolve;

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

  const fetchAttestedSignature = useCallback(async () => {
    if (!market.resolver) return;
    const v = Number(reportValue.trim());
    if (!Number.isFinite(v)) {
      setError("enter a numeric outcome");
      return;
    }
    setResolverBusy("sign");
    setError(null);
    try {
      const res = await fetch("/api/attested/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolverId: market.resolver, value: v }),
      });
      const json = (await res.json()) as {
        error?: string;
        valueWad?: string;
        reportedAt?: number;
        signature?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "sign failed");
      setAttestedSig({
        valueWad: BigInt(json.valueWad!),
        reportedAt: BigInt(json.reportedAt!),
        signature: Buffer.from(json.signature!, "hex"),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "sign failed");
    } finally {
      setResolverBusy(null);
    }
  }, [market.resolver, reportValue]);

  const submitAttested = useCallback(async () => {
    if (!wallet || !market.resolver || !attestedSig) return;
    setResolverBusy("submit");
    setError(null);
    try {
      await kaido.submitAttestedReport(
        market.resolver,
        attestedSig.valueWad,
        attestedSig.reportedAt,
        attestedSig.signature,
        wallet.signer,
      );
      setAttestedSig(null);
      setReportValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "submit failed");
    } finally {
      setResolverBusy(null);
    }
  }, [wallet, market.resolver, attestedSig, kaido]);

  const finalizeAttested = useCallback(async () => {
    if (!wallet || !market.resolver) return;
    setResolverBusy("finalize");
    setError(null);
    try {
      await kaido.finalizeAttestedReport(market.resolver, wallet.signer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "finalize failed");
    } finally {
      setResolverBusy(null);
    }
  }, [wallet, market.resolver, kaido]);

  const disputeAttested = useCallback(async () => {
    if (!wallet || !market.resolver) return;
    setResolverBusy("dispute");
    setError(null);
    try {
      await kaido.disputeAttestedReport(market.resolver, wallet.signer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "dispute failed");
    } finally {
      setResolverBusy(null);
    }
  }, [wallet, market.resolver, kaido]);

  const proposeOptimistic = useCallback(async () => {
    if (!wallet || !market.resolver) return;
    const v = Number(reportValue.trim());
    const bond = Number(optBond.trim());
    if (!Number.isFinite(v) || !Number.isFinite(bond) || bond <= 0) {
      setError(`enter outcome and bond (${sym})`);
      return;
    }
    setResolverBusy("propose");
    setError(null);
    try {
      await kaido.proposeOptimisticOutcome(
        market.resolver,
        toWad(v),
        BigInt(Math.round(bond * 1e7)),
        wallet.signer,
      );
      setReportValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "propose failed");
    } finally {
      setResolverBusy(null);
    }
  }, [wallet, market.resolver, reportValue, optBond, kaido]);

  const disputeOptimistic = useCallback(async () => {
    if (!wallet || !market.resolver) return;
    const v = Number(optAltValue.trim());
    const bond = Number(optBond.trim());
    if (!Number.isFinite(v) || !Number.isFinite(bond) || bond <= 0) {
      setError("enter alternative outcome and bond");
      return;
    }
    setResolverBusy("opt-dispute");
    setError(null);
    try {
      await kaido.disputeOptimisticOutcome(
        market.resolver,
        toWad(v),
        BigInt(Math.round(bond * 1e7)),
        wallet.signer,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "dispute failed");
    } finally {
      setResolverBusy(null);
    }
  }, [wallet, market.resolver, optAltValue, optBond, kaido]);

  const finalizeOptimistic = useCallback(async () => {
    if (!wallet || !market.resolver) return;
    setResolverBusy("opt-finalize");
    setError(null);
    try {
      await kaido.finalizeOptimisticOutcome(market.resolver, wallet.signer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "finalize failed");
    } finally {
      setResolverBusy(null);
    }
  }, [wallet, market.resolver, kaido]);

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
      if (!wallet) return null;
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
        setClaimSuccessPayout(payout);
        setClaimSuccessOpen(true);
        bumpClaim();
        return payout;
      } catch (e) {
        setError(e instanceof Error ? e.message : "claim failed");
        return null;
      } finally {
        setClaimingId(null);
        setClaimReceiptOpen(false);
        setPendingClaimId(null);
      }
    },
    [wallet, kaido, market.address, market.kind, config.network],
  );

  const startClaim = (positionId: string) => {
    setPendingClaimId(positionId);
    setClaimReceiptOpen(true);
  };

  const nextEvent =
    phase === "open"
      ? { label: "Trading locks", at: market.windowLock }
      : phase === "locked"
        ? { label: "Resolves", at: market.windowResolve }
        : null;

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-white/[0.06] bg-[#1c1c21] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]" data-positions-epoch={refreshKey}>
      <div>
        <h2 className="kaido-section-title">
          {isResolved ? "Your payout" : "After trading closes"}
        </h2>
        <p className="mt-1 kaido-section-sub">{phaseLabel(phase)}</p>
        {nextEvent && !isResolved && (
          <p className="mt-1 text-xs text-white/40">
            {nextEvent.label} in{" "}
            <span className="font-mono text-[#d8c69a]">{fmtCountdown(nextEvent.at, nowSec)}</span>
          </p>
        )}
      </div>

      {phase === "awaiting_resolve" && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/85">
          Awaiting oracle resolution — resolves in{" "}
          <span className="font-mono text-[#d8c69a]">
            {fmtCountdown(market.windowResolve, nowSec)}
          </span>
        </div>
      )}

      {phase === "disputable" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-500/25 bg-orange-500/5 px-4 py-3 text-sm text-orange-200/85">
          <span>Outcome is in dispute — settlement paused.</span>
          <Button size="sm" variant="outline" onClick={() => setDisputeOpen(true)}>
            Learn more
          </Button>
        </div>
      )}

      {resolvedOutcomes?.length ? (
        <p className="text-sm text-white/65">
          Final outcome:{" "}
          <span className="font-mono text-lg text-[#d8c69a]">
            {resolvedOutcomes.map((x) => fromWad(x).toPrecision(6)).join(" · ")}
          </span>
        </p>
      ) : null}

      {wallet && isResolved && (
        <div className="space-y-2">
          {loadingChain && positions.length === 0 && (
            <p className="text-xs text-white/40">Loading your positions…</p>
          )}
          {positions.length > 0 ? (
            <ul className="space-y-2">
              {positions.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 border border-white/10 px-4 py-3 text-sm"
                >
                  {p.claimedAt != null && p.payout7dp != null ? (
                    <span className="text-white/55">
                      Paid out {formatUsdc7dp(BigInt(p.payout7dp))} {sym}
                    </span>
                  ) : (
                    <>
                      <span className="text-white/55">Position ready to claim</span>
                      <Button
                        size="sm"
                        disabled={claimingId === p.id}
                        onClick={() => startClaim(p.id)}
                        className="rounded-full bg-[#f3efe6] text-[#0b0b0c] hover:bg-white"
                      >
                        {claimingId === p.id ? <Loader2 className="size-4 animate-spin" /> : null}
                        {claimingId === p.id ? "Claiming…" : "Claim payout"}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            !loadingChain && (
              <p className="text-sm text-white/45">No positions on this market for your wallet.</p>
            )
          )}
        </div>
      )}

      {!wallet && (
        <p className="text-sm text-white/45">Connect Freighter to claim your payout.</p>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      {lastClaim && resolvedOutcomes?.length && market.kWad && market.bWad && market.kind === "scalar" && (
        <ResultCard
          marketLabel="Market"
          kind="scalar"
          market={{ kWad: BigInt(market.kWad), bWad: BigInt(market.bWad) }}
          yourBelief={lastClaim.belief}
          resolvedWad={resolvedOutcomes}
          collateral7dp={lastClaim.collateral7dp}
          payout7dp={lastClaim.payout7dp}
          positionId={lastClaim.positionId}
        />
      )}

      <AdvancedBlock title="Resolver & admin">
        <div className="flex flex-col gap-4">
        {pendingFees && (pendingFees.treasury > 0n || pendingFees.creator > 0n) && wallet && (
        <div className="border border-white/10 px-4 py-3 text-sm">
          <p className="font-medium text-[#f3efe6]">Accrued protocol fees</p>
          <p className="text-xs text-white/45">
            Treasury: {formatUsdc7dp(pendingFees.treasury / 10_000_000_000n)} {sym} · Creator:{" "}
            {formatUsdc7dp(pendingFees.creator / 10_000_000_000n)} {sym}
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

      {canT1Actions && (
        <div className="flex flex-col gap-2 border border-dashed border-white/15 px-4 py-3 text-sm">
          <span className="font-medium text-[#f3efe6]">T1 attested resolver</span>
          {attestedPhase != null && (
            <span className="text-xs text-white/40">phase: {attestedPhase}</span>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span>Outcome value</span>
              <input
                type="text"
                value={reportValue}
                onChange={(e) => setReportValue(e.target.value)}
                className="kaido-input w-40 font-mono"
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={resolverBusy != null || !reportValue.trim()}
              onClick={() => void fetchAttestedSignature()}
            >
              {resolverBusy === "sign" ? "Signing…" : "Get signed report"}
            </Button>
            <Button
              size="sm"
              disabled={resolverBusy != null || !attestedSig}
              onClick={() => void submitAttested()}
            >
              {resolverBusy === "submit" ? "Submitting…" : "Submit on-chain"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={resolverBusy != null}
              onClick={() => void finalizeAttested()}
            >
              Finalize
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={resolverBusy != null}
              onClick={() => void disputeAttested()}
            >
              Dispute
            </Button>
          </div>
        </div>
      )}

      {canT2Actions && (
        <div className="flex flex-col gap-2 border border-dashed border-white/15 px-4 py-3 text-sm">
          <span className="font-medium text-[#f3efe6]">T2 optimistic resolver</span>
          {optPhase != null && (
            <span className="text-xs text-white/40">phase: {optPhase}</span>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span>Proposed outcome</span>
              <input
                type="text"
                value={reportValue}
                onChange={(e) => setReportValue(e.target.value)}
                className="kaido-input w-36 font-mono"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>Bond ({sym})</span>
              <input
                type="text"
                value={optBond}
                onChange={(e) => setOptBond(e.target.value)}
                className="kaido-input w-24 font-mono"
              />
            </label>
            <Button size="sm" disabled={resolverBusy != null} onClick={() => void proposeOptimistic()}>
              Propose
            </Button>
            <label className="flex flex-col gap-1">
              <span>Dispute value</span>
              <input
                type="text"
                value={optAltValue}
                onChange={(e) => setOptAltValue(e.target.value)}
                className="kaido-input w-36 font-mono"
              />
            </label>
            <Button size="sm" variant="secondary" disabled={resolverBusy != null} onClick={() => void disputeOptimistic()}>
              Dispute
            </Button>
            <Button size="sm" variant="outline" disabled={resolverBusy != null} onClick={() => void finalizeOptimistic()}>
              Finalize
            </Button>
          </div>
        </div>
      )}

      {canReportT3 && (
        <div className="flex flex-wrap items-end gap-2 border border-dashed border-white/15 px-4 py-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-[#f3efe6]">T3 designated report (outcome value)</span>
            <input
              type="text"
              value={reportValue}
              onChange={(e) => setReportValue(e.target.value)}
              placeholder="e.g. 65000"
              className="kaido-input w-40 font-mono"
            />
          </label>
          <Button size="sm" onClick={() => void reportT3()} disabled={reporting || !reportValue.trim()}>
            {reporting ? "Reporting…" : "Report outcome"}
          </Button>
        </div>
      )}

      {wallet && canResolve && !isResolved && (
        <Button
          size="sm"
          onClick={() => void resolveMarket()}
          disabled={resolving}
          className="rounded-full bg-[#f3efe6] text-[#0b0b0c] hover:bg-white"
        >
          {resolving ? <Loader2 className="size-4 animate-spin" /> : null}
          {resolving ? "Resolving…" : "Resolve market"}
        </Button>
      )}

      {wallet && isResolved && (
        <div className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-[#f3efe6]">Claim by position #</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 1"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              className="kaido-input w-32 font-mono"
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={!manualId.trim() || claimingId != null}
            onClick={() => startClaim(manualId.trim())}
            className="border-white/20 text-[#f3efe6] hover:bg-white/5"
          >
            Claim
          </Button>
        </div>
      )}
        </div>
      </AdvancedBlock>

      <ClaimReceiptModal
        open={claimReceiptOpen}
        onOpenChange={setClaimReceiptOpen}
        positionId={pendingClaimId ?? ""}
        collateral7dp={
          pendingClaimId && wallet
            ? (() => {
                const c = loadPositions(config.network, wallet.signer.accountId, market.address).find(
                  (p) => p.id === pendingClaimId,
                )?.collateral7dp;
                return c ? BigInt(c) : undefined;
              })()
            : undefined
        }
        onConfirm={() => pendingClaimId && void claimPosition(pendingClaimId)}
        confirming={claimingId != null}
      />
      <ClaimSuccessModal
        open={claimSuccessOpen}
        onOpenChange={setClaimSuccessOpen}
        payout7dp={claimSuccessPayout ?? 0n}
      >
        {lastClaim && resolvedOutcomes?.length && market.kWad && market.bWad && market.kind === "scalar" && (
          <ResultCard
            marketLabel="Market"
            kind="scalar"
            market={{ kWad: BigInt(market.kWad), bWad: BigInt(market.bWad) }}
            yourBelief={lastClaim.belief}
            resolvedWad={resolvedOutcomes}
            collateral7dp={lastClaim.collateral7dp}
            payout7dp={lastClaim.payout7dp}
            positionId={lastClaim.positionId}
          />
        )}
      </ClaimSuccessModal>
      <DisputeInfoModal open={disputeOpen} onOpenChange={setDisputeOpen} />
    </div>
  );
}
