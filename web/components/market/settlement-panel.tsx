"use client";

/**
 * Post-trade lifecycle on /markets/[id]: window phase, resolve, claim payouts.
 */
import { Kaido, type KaidoConfig } from "@kaido/sdk";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/provider";
import { fromWad } from "@/lib/curve";
import {
  formatUsdc7dp,
  loadPositions,
  markClaimed,
  type SavedPosition,
} from "@/lib/positions";

export interface SettlementMarketView {
  address: string;
  kind: "scalar" | "trajectory";
  statusTag: "Open" | "Locked" | "Resolved" | "ResolvedVec" | "Disputable";
  windowOpen: number;
  windowLock: number;
  windowResolve: number;
  /** Resolved outcome value(s) in WAD, if known. */
  resolvedWad?: string[];
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
  const [, bumpClaimEpoch] = useState(0);
  const [resolving, setResolving] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvedOverride, setResolvedOverride] = useState<bigint[] | null>(null);

  const positions: SavedPosition[] = wallet
    ? loadPositions(config.network, wallet.signer.accountId, market.address)
    : [];

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

  const claimPosition = useCallback(
    async (positionId: string) => {
      if (!wallet) return;
      setClaimingId(positionId);
      setError(null);
      try {
        const id = BigInt(positionId);
        const payout =
          market.kind === "trajectory"
            ? await kaido.claimTrajectory(market.address, id, wallet.signer)
            : await kaido.claim(market.address, id, wallet.signer);
        markClaimed(config.network, wallet.signer.accountId, market.address, id, payout);
        bumpClaimEpoch((n) => n + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "claim failed");
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

      {wallet && canResolve && !isResolved && (
        <Button size="sm" onClick={() => void resolveMarket()} disabled={resolving}>
          {resolving ? <Loader2 className="size-4 animate-spin" /> : null}
          {resolving ? "Resolving…" : "Resolve market"}
        </Button>
      )}

      {wallet && isResolved && positions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Your positions</h3>
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
        </div>
      )}

      {wallet && isResolved && positions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No positions saved for this wallet on this market. If you traded from another browser, claim
          with position id via the SDK.
        </p>
      )}

      {!wallet && (
        <p className="text-sm text-muted-foreground">Connect a wallet to resolve or claim payouts.</p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
